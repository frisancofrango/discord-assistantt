import { createHmac } from 'node:crypto';
import { NativeError, assertTransition, authorize, audit, idempotent, safeEqual, stableHash, transaction } from './core.js';
import { PRODUCTS } from '../config.js';

const transitions = {
  pending: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid: ['fulfilling', 'refunded'],
  fulfilling: ['fulfilled', 'refunded'],
  fulfilled: ['refunded'],
  cancelled: [],
  refunded: [],
};

export class HmacPaymentAdapter {
  constructor({ name = 'hmac', secret }) {
    if (!secret) throw new TypeError('Payment webhook secret is required');
    this.name = name;
    this.secret = secret;
  }

  sign(raw) {
    return createHmac('sha256', this.secret).update(raw).digest('hex');
  }

  verify(raw, signature) {
    return safeEqual(this.sign(raw), signature);
  }

  parse(raw) {
    return JSON.parse(raw);
  }
}

export class CommerceService {
  constructor({ db, queue, tools, analytics, paymentAdapters = {}, config = {} }) {
    Object.assign(this, { db, queue, tools, analytics, paymentAdapters });
    this.config = {
      reservationMinutes: config.reservationMinutes ?? 15,
      acceptableUseVersion: config.acceptableUseVersion ?? '1',
      highValueMinor: config.highValueMinor ?? 100000,
      ...config,
    };
  }

  /** Ensure default catalog is seeded for guild if DB is empty. */
  async seedDefaultCatalog(guildId) {
    const count = (await this.db.query(
      `SELECT count(*)::int FROM products WHERE guild_id = $1`,
      [guildId]
    )).rows[0]?.count ?? 0;

    if (count > 0) return;

    for (const p of PRODUCTS) {
      const priceNum = parseInt(p.price.replace(/[^0-9]/g, ''), 10) * 100 || 1000;
      const productRow = (await this.db.query(
        `INSERT INTO products (guild_id, sku, name, description, acceptable_use, active, metadata)
         VALUES ($1, $2, $3, $4, 'Standard digital goods acceptable use policy.', true, $5)
         ON CONFLICT (guild_id, sku) DO UPDATE SET name = excluded.name RETURNING *`,
        [guildId, p.id, p.name, p.tagline, JSON.stringify({ perks: p.perks })]
      )).rows[0];

      await this.db.query(
        `INSERT INTO product_variants (product_id, sku, name, price_minor, currency, stock, delivery_config, active)
         VALUES ($1, $2, $3, $4, 'USD', 100, $5, true)
         ON CONFLICT (sku) DO UPDATE SET price_minor = excluded.price_minor`,
        [productRow.id, `${p.id}_std`, `${p.name} Standard`, priceNum, JSON.stringify({ mechanism: 'role_grant', perks: p.perks })]
      );
    }
  }

  async listProducts(guildId) {
    await this.seedDefaultCatalog(guildId);
    const rows = (await this.db.query(
      `SELECT p.id as product_id, p.sku as product_sku, p.name as product_name, p.description, p.acceptable_use,
              v.id as variant_id, v.sku as variant_sku, v.name as variant_name, v.price_minor, v.currency,
              v.stock, v.reserved, (COALESCE(v.stock, 999999) - v.reserved) as available_stock, v.delivery_config
       FROM products p
       JOIN product_variants v ON v.product_id = p.id
       WHERE p.guild_id = $1 AND p.active = true AND v.active = true
       ORDER BY p.created_at ASC, v.price_minor ASC`,
      [guildId]
    )).rows;

    const productsMap = new Map();
    for (const r of rows) {
      if (!productsMap.has(r.product_id)) {
        productsMap.set(r.product_id, {
          id: r.product_id,
          sku: r.product_sku,
          name: r.product_name,
          description: r.description,
          acceptableUse: r.acceptable_use,
          variants: [],
        });
      }
      productsMap.get(r.product_id).variants.push({
        id: r.variant_id,
        sku: r.variant_sku,
        name: r.variant_name,
        priceMinor: Number(r.price_minor),
        currency: r.currency,
        stock: r.stock !== null ? Number(r.stock) : null,
        reserved: Number(r.reserved),
        availableStock: Number(r.available_stock),
        deliveryConfig: r.delivery_config,
      });
    }

    return Array.from(productsMap.values());
  }

  async upsertProduct(input, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'medium', permissions: ['ManageGuild'], financial: true });
    if (/stolen|cracked|credential|account login/i.test(`${input.name} ${input.description ?? ''}`)) {
      throw new NativeError('acceptable_use_denied', 'Unauthorized accounts or credentials are prohibited');
    }
    if (!input.acceptableUse) {
      throw new NativeError('acceptable_use_required', 'A legitimate-goods acceptable-use statement is required');
    }

    return (await this.db.query(
      `INSERT INTO products (guild_id, sku, name, description, acceptable_use, active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (guild_id, sku) DO UPDATE
       SET name = excluded.name,
           description = excluded.description,
           acceptable_use = excluded.acceptable_use,
           active = excluded.active,
           metadata = excluded.metadata,
           updated_at = now()
       RETURNING *`,
      [ctx.guildId, input.sku, input.name, input.description, input.acceptableUse, input.active ?? true, JSON.stringify(input.metadata ?? {})]
    )).rows[0];
  }

  async getCart(guildId, memberId) {
    await this.releaseExpiredCarts();
    const cart = (await this.db.query(
      `SELECT * FROM carts WHERE guild_id = $1 AND member_id = $2 AND status = 'active'`,
      [guildId, memberId]
    )).rows[0];

    if (!cart) {
      return { id: null, guildId, memberId, items: [], subtotalMinor: 0, currency: 'USD', expiresAt: null };
    }

    const items = (await this.db.query(
      `SELECT ci.quantity, v.id as variant_id, v.sku as variant_sku, v.name as variant_name,
              v.price_minor, v.currency, v.stock, v.reserved, p.name as product_name, p.sku as product_sku
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant_id
       JOIN products p ON p.id = v.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.quantity DESC`,
      [cart.id]
    )).rows;

    const subtotalMinor = items.reduce((sum, item) => sum + (Number(item.price_minor) * item.quantity), 0);
    const currency = items[0]?.currency ?? 'USD';

    return {
      id: cart.id,
      guildId: cart.guild_id,
      memberId: cart.member_id,
      status: cart.status,
      expiresAt: cart.expires_at,
      subtotalMinor,
      currency,
      items: items.map((i) => ({
        variantId: i.variant_id,
        variantSku: i.variant_sku,
        variantName: i.variant_name,
        productName: i.product_name,
        quantity: i.quantity,
        priceMinor: Number(i.price_minor),
        currency: i.currency,
        totalMinor: Number(i.price_minor) * i.quantity,
      })),
    };
  }

  async addToCart(input, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'low', financial: true });
    return idempotent(this.db, 'commerce.cart', input.idempotencyKey || `cart:add:${ctx.guildId}:${input.memberId}:${input.variantId}:${Date.now()}`, input, async (c) => {
      const variant = (await c.query(
        `SELECT v.*, p.active as product_active, p.name as product_name
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = $1 FOR UPDATE`,
        [input.variantId]
      )).rows[0];

      if (!variant?.active || !variant.product_active) {
        throw new NativeError('unavailable', 'Product variant is unavailable');
      }

      const qty = parseInt(input.quantity, 10) || 1;
      if (qty <= 0) throw new NativeError('invalid_quantity', 'Quantity must be positive');

      let cart = (await c.query(
        `SELECT * FROM carts WHERE guild_id = $1 AND member_id = $2 AND status = 'active' FOR UPDATE`,
        [ctx.guildId, input.memberId]
      )).rows[0];

      if (!cart) {
        cart = (await c.query(
          `INSERT INTO carts (guild_id, member_id, expires_at)
           VALUES ($1, $2, $3) RETURNING *`,
          [ctx.guildId, input.memberId, new Date(Date.now() + this.config.reservationMinutes * 60000)]
        )).rows[0];
      }

      const prior = (await c.query(
        `SELECT quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2`,
        [cart.id, input.variantId]
      )).rows[0]?.quantity ?? 0;

      const newTotalQty = prior + qty;
      const delta = qty;

      if (variant.stock !== null && (variant.stock - variant.reserved) < delta) {
        throw new NativeError('out_of_stock', `Insufficient inventory (Available: ${variant.stock - variant.reserved})`);
      }

      await c.query(
        `INSERT INTO cart_items (cart_id, variant_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = excluded.quantity`,
        [cart.id, input.variantId, newTotalQty]
      );

      await c.query(
        `UPDATE product_variants SET reserved = reserved + $2, updated_at = now() WHERE id = $1`,
        [input.variantId, delta]
      );

      return {
        cartId: cart.id,
        variantId: input.variantId,
        productName: variant.product_name,
        quantity: newTotalQty,
        expiresAt: cart.expires_at,
      };
    });
  }

  async removeFromCart(input, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'low', financial: true });
    return transaction(this.db, async (c) => {
      const item = (await c.query(
        `SELECT ci.*, c.status
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         WHERE ci.cart_id = $1 AND ci.variant_id = $2 AND c.member_id = $3 FOR UPDATE`,
        [input.cartId, input.variantId, input.memberId]
      )).rows[0];

      if (!item) return { removed: false };

      await c.query(`DELETE FROM cart_items WHERE cart_id = $1 AND variant_id = $2`, [input.cartId, input.variantId]);
      await c.query(
        `UPDATE product_variants SET reserved = GREATEST(0, reserved - $2), updated_at = now() WHERE id = $1`,
        [input.variantId, item.quantity]
      );

      return { removed: true, variantId: input.variantId, quantity: item.quantity };
    });
  }

  async clearCart(input, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'low', financial: true });
    return transaction(this.db, async (c) => {
      const items = (await c.query(
        `SELECT ci.variant_id, ci.quantity
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         WHERE ci.cart_id = $1 AND c.member_id = $2 AND c.status = 'active' FOR UPDATE`,
        [input.cartId, input.memberId]
      )).rows;

      for (const it of items) {
        await c.query(
          `UPDATE product_variants SET reserved = GREATEST(0, reserved - $2), updated_at = now() WHERE id = $1`,
          [it.variant_id, it.quantity]
        );
      }

      await c.query(`DELETE FROM cart_items WHERE cart_id = $1`, [input.cartId]);
      await c.query(`UPDATE carts SET status = 'cancelled', updated_at = now() WHERE id = $1`, [input.cartId]);

      return { cleared: true, itemsCount: items.length };
    });
  }

  async checkout(input, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'high', financial: true });
    if (!input.acceptableUseAccepted) {
      throw new NativeError('acceptable_use_required', 'Buyer must accept the legitimate-goods policy');
    }

    const order = await idempotent(this.db, 'commerce.checkout', input.idempotencyKey || `checkout:${input.cartId}:${Date.now()}`, input, async (c) => {
      const cart = (await c.query(
        `SELECT * FROM carts WHERE id = $1 AND member_id = $2 AND status = 'active' FOR UPDATE`,
        [input.cartId, input.memberId]
      )).rows[0];

      if (!cart || new Date(cart.expires_at) <= new Date()) {
        throw new NativeError('cart_expired', 'Cart is unavailable or expired');
      }

      const items = (await c.query(
        `SELECT ci.*, v.sku, v.name, v.price_minor, v.currency, v.stock, v.reserved, v.delivery_config
         FROM cart_items ci
         JOIN product_variants v ON v.id = ci.variant_id
         WHERE ci.cart_id = $1 FOR UPDATE OF v`,
        [cart.id]
      )).rows;

      if (!items.length) throw new NativeError('empty_cart', 'Cart is empty');

      const currencies = new Set(items.map((i) => i.currency));
      if (currencies.size !== 1) throw new NativeError('mixed_currency', 'Cart currencies must match');

      const subtotal = items.reduce((n, i) => n + (Number(i.price_minor) * i.quantity), 0);
      const flags = [];
      if (input.accountAgeDays !== null && input.accountAgeDays !== undefined && input.accountAgeDays < 7) flags.push('new_account');
      if (subtotal > Number(this.config.highValueMinor ?? 100000)) flags.push('high_value');

      const o = (await c.query(
        `INSERT INTO orders (guild_id, member_id, cart_id, status, currency, subtotal_minor, risk_flags, acceptable_use_accepted_at)
         VALUES ($1, $2, $3, 'awaiting_payment', $4, $5, $6, now()) RETURNING *`,
        [ctx.guildId, input.memberId, cart.id, items[0].currency, subtotal, JSON.stringify(flags)]
      )).rows[0];

      for (const i of items) {
        await c.query(
          `INSERT INTO order_items (order_id, variant_id, sku, name, quantity, unit_price_minor)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [o.id, i.variant_id, i.sku, i.name, i.quantity, i.price_minor]
        );
      }

      await c.query(`UPDATE carts SET status = 'checked_out', updated_at = now() WHERE id = $1`, [cart.id]);
      return o;
    });

    await this.analytics?.record({
      guildId: ctx.guildId,
      name: 'order.created',
      subjectType: 'order',
      subjectId: order.id,
      metrics: { amount_minor: Number(order.subtotal_minor) },
      idempotencyKey: `order:${order.id}:created`,
    });

    await audit(this.db, ctx, {
      action: 'commerce.checkout',
      domain: 'commerce',
      risk: 'high',
      metadata: { orderId: order.id, riskFlags: order.risk_flags },
    });

    return order;
  }

  async checkoutWithWallet({ cartId, memberId, walletService, acceptableUseAccepted, idempotencyKey }, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'high', financial: true });
    if (!acceptableUseAccepted) throw new NativeError('acceptable_use_required', 'Buyer must accept the legitimate-goods policy');

    const order = await this.checkout({ cartId, memberId, acceptableUseAccepted: true, idempotencyKey }, ctx);

    // Atomically debit wallet and transition order to paid
    const paidOrder = await transaction(this.db, async (c) => {
      const currentOrder = (await c.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [order.id])).rows[0];
      if (currentOrder.status !== 'awaiting_payment') throw new NativeError('invalid_order_status', 'Order is not awaiting payment');

      const subtotal = Number(currentOrder.subtotal_minor);
      const currency = currentOrder.currency;

      // Check and debit wallet
      const wallet = (await c.query(
        `SELECT * FROM wallets WHERE guild_id = $1 AND member_id = $2 AND currency = $3 FOR UPDATE`,
        [ctx.guildId, memberId, currency]
      )).rows[0];

      if (!wallet) throw new NativeError('wallet_not_found', 'Wallet not found');
      const available = Number(wallet.balance_minor) - Number(wallet.locked_minor);
      if (available < subtotal) {
        throw new NativeError('insufficient_funds', `Insufficient wallet balance: $${(available / 100).toFixed(2)} available, $${(subtotal / 100).toFixed(2)} required.`);
      }

      const newBalance = Number(wallet.balance_minor) - subtotal;
      await c.query(`UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE id = $2`, [newBalance, wallet.id]);

      await c.query(
        `INSERT INTO wallet_transactions (wallet_id, guild_id, member_id, type, amount_minor, currency, balance_after_minor, reference_id, metadata)
         VALUES ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8)`,
        [wallet.id, ctx.guildId, memberId, -subtotal, currency, newBalance, currentOrder.id, JSON.stringify({ orderId: currentOrder.id })]
      );

      // Decrement stock and unreserve
      const orderItems = (await c.query(`SELECT * FROM order_items WHERE order_id = $1`, [currentOrder.id])).rows;
      for (const item of orderItems) {
        await c.query(
          `UPDATE product_variants
           SET stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - $2 END,
               reserved = GREATEST(0, reserved - $2),
               updated_at = now()
           WHERE id = $1`,
          [item.variant_id, item.quantity]
        );
      }

      // Mark order paid -> fulfilled
      const updated = (await c.query(
        `UPDATE orders SET status = 'fulfilled', provider = 'wallet', provider_reference = $2, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [currentOrder.id, `wallet:${wallet.id}`]
      )).rows[0];

      await c.query(
        `INSERT INTO fulfillment_events (order_id, state, mechanism, receipt)
         VALUES ($1, 'fulfilled', 'wallet_instant', $2)`,
        [currentOrder.id, JSON.stringify({ paidAt: new Date().toISOString(), walletId: wallet.id })]
      );

      return updated;
    });

    await audit(this.db, ctx, {
      action: 'commerce.wallet_purchase',
      domain: 'commerce',
      risk: 'high',
      metadata: { orderId: order.id, amountMinor: order.subtotal_minor },
    });

    return paidOrder;
  }

  async fulfill(orderId, mechanism, receipt, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'high', permissions: ['ManageGuild'], financial: true });
    const order = (await this.db.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId])).rows[0];
    if (!order) throw new NativeError('not_found', 'Order not found');
    assertTransition(order.status, 'fulfilling', transitions);

    if (!['role_grant', 'private_channel', 'download_token', 'license_key', 'wallet_instant', 'manual'].includes(mechanism)) {
      throw new NativeError('unsafe_delivery', 'Delivery mechanism is not allowlisted');
    }

    await this.db.query(`UPDATE orders SET status = 'fulfilled', updated_at = now() WHERE id = $1`, [orderId]);
    await this.db.query(
      `INSERT INTO fulfillment_events (order_id, state, mechanism, receipt) VALUES ($1, 'fulfilled', $2, $3)`,
      [orderId, mechanism, JSON.stringify(receipt)]
    );

    return { orderId, status: 'fulfilled', mechanism };
  }

  async getOrder(orderId) {
    const order = (await this.db.query(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];
    if (!order) return null;
    const items = (await this.db.query(`SELECT * FROM order_items WHERE order_id = $1`, [orderId])).rows;
    const fulfillment = (await this.db.query(`SELECT * FROM fulfillment_events WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId])).rows[0];

    return {
      ...order,
      subtotalMinor: Number(order.subtotal_minor),
      items: items.map((i) => ({ ...i, unitPriceMinor: Number(i.unit_price_minor) })),
      fulfillment: fulfillment ? { state: fulfillment.state, mechanism: fulfillment.mechanism, receipt: fulfillment.receipt } : null,
    };
  }

  async listMemberOrders(guildId, memberId, limit = 10) {
    const orders = (await this.db.query(
      `SELECT * FROM orders WHERE guild_id = $1 AND member_id = $2 ORDER BY created_at DESC LIMIT $3`,
      [guildId, memberId, limit]
    )).rows;

    const result = [];
    for (const o of orders) {
      const items = (await this.db.query(`SELECT * FROM order_items WHERE order_id = $1`, [o.id])).rows;
      result.push({
        ...o,
        subtotalMinor: Number(o.subtotal_minor),
        items: items.map((i) => ({ ...i, unitPriceMinor: Number(i.unit_price_minor) })),
      });
    }
    return result;
  }

  async webhook(providerName, { rawBody, signature, eventId }, ctx = {}) {
    const adapter = this.paymentAdapters[providerName];
    if (!adapter) throw new NativeError('unknown_provider', 'Unknown payment provider');
    if (!adapter.verify(rawBody, signature)) throw new NativeError('invalid_signature', 'Webhook signature verification failed');

    const event = adapter.parse(rawBody);
    return idempotent(this.db, `payment.${providerName}`, eventId, { eventId, payloadHash: stableHash(rawBody) }, async (c) => {
      const order = (await c.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [event.orderId])).rows[0];
      if (!order) throw new NativeError('not_found', 'Order not found');

      const next = event.type === 'payment.succeeded' ? 'paid' : event.type === 'payment.refunded' ? 'refunded' : event.type === 'payment.cancelled' ? 'cancelled' : null;
      if (!next) throw new NativeError('unsupported_event', 'Unsupported payment event');
      assertTransition(order.status, next, transitions);

      await c.query(
        `INSERT INTO payment_events (provider, event_id, signature_hash, event_type, order_id, payload_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [providerName, eventId, stableHash(signature), event.type, order.id, stableHash(rawBody)]
      );

      const updated = (await c.query(
        `UPDATE orders SET status = $2, provider = $3, provider_reference = COALESCE($4, provider_reference),
                refund_minor = CASE WHEN $2 = 'refunded' THEN subtotal_minor ELSE refund_minor END,
                updated_at = now()
         WHERE id = $1 RETURNING *`,
        [order.id, next, providerName, event.reference ?? null]
      )).rows[0];

      if (next === 'paid') {
        for (const item of (await c.query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id])).rows) {
          await c.query(
            `UPDATE product_variants
             SET stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - $2 END,
                 reserved = GREATEST(0, reserved - $2),
                 updated_at = now()
             WHERE id = $1`,
            [item.variant_id, item.quantity]
          );
        }
      }

      return updated;
    }).then(async (order) => {
      await this.analytics?.record({
        guildId: order.guild_id,
        name: `order.${order.status}`,
        subjectType: 'order',
        subjectId: order.id,
        metrics: { amount_minor: Number(order.subtotal_minor) },
        idempotencyKey: `payment:${providerName}:${eventId}:analytics`,
      });
      return order;
    });
  }

  async releaseExpiredCarts() {
    return this.db.query(
      `WITH expired AS (
         UPDATE carts SET status = 'expired', updated_at = now()
         WHERE status = 'active' AND expires_at <= now()
         RETURNING id
       )
       UPDATE product_variants v
       SET reserved = GREATEST(0, reserved - x.quantity), updated_at = now()
       FROM (
         SELECT variant_id, sum(quantity)::int as quantity
         FROM cart_items
         WHERE cart_id IN (SELECT id FROM expired)
         GROUP BY variant_id
       ) x
       WHERE v.id = x.variant_id
       RETURNING v.id`
    );
  }
}
