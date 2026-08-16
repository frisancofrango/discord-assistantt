import test from 'node:test';
import assert from 'node:assert/strict';
import { CommerceService } from '../src/native/commerce.js';
import { WalletService } from '../src/native/wallet.js';

function createCommerceMockDb() {
  const products = [
    { id: 'p1', guild_id: 'g1', sku: 'starter', name: 'STARTER', description: 'Starter plan', acceptable_use: 'Standard', active: true, metadata: {} },
    { id: 'p2', guild_id: 'g1', sku: 'pro', name: 'PRO', description: 'Pro plan', acceptable_use: 'Standard', active: true, metadata: {} }
  ];
  const variants = [
    { id: 'v1', product_id: 'p1', sku: 'starter_std', name: 'Starter Standard', price_minor: 900, currency: 'USD', stock: 50, reserved: 0, active: true },
    { id: 'v2', product_id: 'p2', sku: 'pro_std', name: 'Pro Standard', price_minor: 2900, currency: 'USD', stock: 20, reserved: 0, active: true }
  ];
  const carts = new Map();
  const cartItems = new Map();
  const orders = new Map();
  const orderItems = [];
  const fulfillmentEvents = [];
  const wallets = new Map();
  const walletTransactions = [];
  const idempotency = new Map();

  return {
    products,
    variants,
    carts,
    cartItems,
    orders,
    orderItems,
    fulfillmentEvents,
    wallets,
    walletTransactions,
    idempotency,
    async connect() {
      return {
        async query(sql, params) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          return mockCommerceQuery(sql, params, { products, variants, carts, cartItems, orders, orderItems, fulfillmentEvents, wallets, walletTransactions, idempotency });
        },
        release() {},
      };
    },
    async query(sql, params) {
      return mockCommerceQuery(sql, params, { products, variants, carts, cartItems, orders, orderItems, fulfillmentEvents, wallets, walletTransactions, idempotency });
    },
  };
}

function mockCommerceQuery(sql, params, store) {
  const lower = sql.toLowerCase();

  if (lower.includes('select count(*)::int from products')) {
    return { rows: [{ count: store.products.length }] };
  }

  if (lower.includes('select * from native_idempotency')) {
    const key = `${params[0]}:${params[1]}`;
    const row = store.idempotency.get(key);
    return { rows: row ? [row] : [] };
  }

  if (lower.includes('insert into native_idempotency')) {
    const key = `${params[0]}:${params[1]}`;
    const row = { scope: params[0], idempotency_key: params[1], input_hash: params[2], status: params[3], result: null };
    store.idempotency.set(key, row);
    return { rows: [row] };
  }

  if (lower.includes('update native_idempotency')) {
    const key = `${params[0]}:${params[1]}`;
    const row = store.idempotency.get(key) || {};
    row.status = 'completed';
    row.result = params[2] ? JSON.parse(params[2]) : null;
    store.idempotency.set(key, row);
    return { rows: [row] };
  }

  if (lower.includes('select p.id as product_id')) {
    const rows = [];
    for (const p of store.products) {
      for (const v of store.variants.filter((v) => v.product_id === p.id)) {
        rows.push({
          product_id: p.id,
          product_sku: p.sku,
          product_name: p.name,
          description: p.description,
          acceptable_use: p.acceptable_use,
          variant_id: v.id,
          variant_sku: v.sku,
          variant_name: v.name,
          price_minor: v.price_minor,
          currency: v.currency,
          stock: v.stock,
          reserved: v.reserved,
          available_stock: v.stock - v.reserved,
          delivery_config: {},
        });
      }
    }
    return { rows };
  }

  if (lower.includes('select v.*, p.active as product_active')) {
    const v = store.variants.find((x) => x.id === params[0]);
    const p = v ? store.products.find((x) => x.id === v.product_id) : null;
    if (v && p) return { rows: [{ ...v, product_active: p.active, product_name: p.name }] };
    return { rows: [] };
  }

  if (lower.includes('select * from carts where guild_id = $1 and member_id = $2 and status = \'active\'')) {
    for (const c of store.carts.values()) {
      if (c.guild_id === params[0] && c.member_id === params[1] && c.status === 'active') {
        return { rows: [{ ...c }] };
      }
    }
    return { rows: [] };
  }

  if (lower.includes('insert into carts')) {
    const cart = {
      id: `cart-${Date.now()}-${Math.random()}`,
      guild_id: params[0],
      member_id: params[1],
      status: 'active',
      expires_at: params[2],
      created_at: new Date(),
      updated_at: new Date(),
    };
    store.carts.set(cart.id, cart);
    return { rows: [cart] };
  }

  if (lower.includes('select quantity from cart_items')) {
    const key = `${params[0]}:${params[1]}`;
    const it = store.cartItems.get(key);
    return { rows: it ? [{ quantity: it.quantity }] : [] };
  }

  if (lower.includes('insert into cart_items')) {
    const key = `${params[0]}:${params[1]}`;
    const it = { cart_id: params[0], variant_id: params[1], quantity: params[2] };
    store.cartItems.set(key, it);
    return { rows: [it] };
  }

  if (lower.includes('update product_variants set reserved = reserved + $2')) {
    const v = store.variants.find((x) => x.id === params[0]);
    if (v) v.reserved += params[1];
    return { rows: [] };
  }

  if (lower.includes('select ci.quantity, v.id as variant_id')) {
    const rows = [];
    for (const it of store.cartItems.values()) {
      if (it.cart_id === params[0]) {
        const v = store.variants.find((x) => x.id === it.variant_id);
        const p = v ? store.products.find((x) => x.id === v.product_id) : null;
        if (v && p) {
          rows.push({
            quantity: it.quantity,
            variant_id: v.id,
            variant_sku: v.sku,
            variant_name: v.name,
            price_minor: v.price_minor,
            currency: v.currency,
            stock: v.stock,
            reserved: v.reserved,
            product_name: p.name,
            product_sku: p.sku,
          });
        }
      }
    }
    return { rows };
  }

  if (lower.includes('select * from carts where id = $1 and member_id = $2 and status = \'active\'')) {
    const c = store.carts.get(params[0]);
    if (c && c.member_id === params[1] && c.status === 'active') return { rows: [c] };
    return { rows: [] };
  }

  if (lower.includes('select ci.*, v.sku, v.name, v.price_minor')) {
    const rows = [];
    for (const it of store.cartItems.values()) {
      if (it.cart_id === params[0]) {
        const v = store.variants.find((x) => x.id === it.variant_id);
        if (v) {
          rows.push({
            cart_id: it.cart_id,
            variant_id: it.variant_id,
            quantity: it.quantity,
            sku: v.sku,
            name: v.name,
            price_minor: v.price_minor,
            currency: v.currency,
            stock: v.stock,
            reserved: v.reserved,
            delivery_config: {},
          });
        }
      }
    }
    return { rows };
  }

  if (lower.includes('insert into orders')) {
    const o = {
      id: `ord-${Date.now()}`,
      guild_id: params[0],
      member_id: params[1],
      cart_id: params[2],
      status: 'awaiting_payment',
      currency: params[3],
      subtotal_minor: params[4],
      risk_flags: params[5],
      created_at: new Date(),
      updated_at: new Date(),
    };
    store.orders.set(o.id, o);
    return { rows: [o] };
  }

  if (lower.includes('insert into order_items')) {
    const oi = {
      order_id: params[0],
      variant_id: params[1],
      sku: params[2],
      name: params[3],
      quantity: params[4],
      unit_price_minor: params[5],
    };
    store.orderItems.push(oi);
    return { rows: [oi] };
  }

  if (lower.includes('update carts set status = \'checked_out\'')) {
    const c = store.carts.get(params[0]);
    if (c) c.status = 'checked_out';
    return { rows: [] };
  }

  if (lower.includes('select * from orders where id = $1')) {
    const o = store.orders.get(params[0]);
    return { rows: o ? [{ ...o }] : [] };
  }

  if (lower.includes('select * from order_items where order_id = $1')) {
    const rows = store.orderItems.filter((i) => i.order_id === params[0]);
    return { rows };
  }

  if (lower.includes('select * from wallets where guild_id = $1 and member_id = $2 and currency = $3')) {
    const key = `${params[0]}:${params[1]}:${params[2]}`;
    let w = store.wallets.get(key);
    if (!w) {
      w = { id: `w-${params[1]}`, guild_id: params[0], member_id: params[1], currency: params[2], balance_minor: 10000, locked_minor: 0 };
      store.wallets.set(key, w);
    }
    return { rows: [{ ...w }] };
  }

  if (lower.includes('update wallets set balance_minor = $1')) {
    for (const w of store.wallets.values()) {
      if (w.id === params[1]) {
        w.balance_minor = params[0];
        return { rows: [w] };
      }
    }
    return { rows: [] };
  }

  if (lower.includes('update orders set status = \'fulfilled\'')) {
    const o = store.orders.get(params[0]);
    if (o) {
      o.status = 'fulfilled';
      o.provider = 'wallet';
    }
    return { rows: [o] };
  }

  if (lower.includes('insert into fulfillment_events')) {
    store.fulfillmentEvents.push(params);
    return { rows: [] };
  }

  if (lower.includes('insert into audit')) {
    return { rows: [] };
  }

  return { rows: [] };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true, permissions: [] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('CommerceService: listProducts returns catalog with variants and stock', async () => {
  const db = createCommerceMockDb();
  const svc = new CommerceService({ db });

  const products = await svc.listProducts('g1');
  assert.equal(products.length, 2);
  assert.equal(products[0].name, 'STARTER');
  assert.equal(products[0].variants[0].priceMinor, 900);
});

test('CommerceService: addToCart and getCart manages persistent cart state', async () => {
  const db = createCommerceMockDb();
  const svc = new CommerceService({ db });

  await svc.addToCart({ variantId: 'v1', quantity: 2, memberId: 'u1' }, mockCtx);
  const cart = await svc.getCart('g1', 'u1');

  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(cart.subtotalMinor, 1800); // 2 * $9.00 = $18.00
  assert.equal(cart.currency, 'USD');
});

test('CommerceService: checkout creates order and transitions cart', async () => {
  const db = createCommerceMockDb();
  const svc = new CommerceService({ db });

  await svc.addToCart({ variantId: 'v2', quantity: 1, memberId: 'u1' }, mockCtx);
  const cart = await svc.getCart('g1', 'u1');

  const order = await svc.checkout(
    { cartId: cart.id, memberId: 'u1', acceptableUseAccepted: true },
    mockCtx
  );

  assert.equal(order.status, 'awaiting_payment');
  assert.equal(Number(order.subtotal_minor), 2900);
});

test('CommerceService: checkoutWithWallet debits balance and fulfills order', async () => {
  const db = createCommerceMockDb();
  const svc = new CommerceService({ db });
  const walletSvc = new WalletService({ db });

  await svc.addToCart({ variantId: 'v1', quantity: 1, memberId: 'u1' }, mockCtx);
  const cart = await svc.getCart('g1', 'u1');

  const fulfilledOrder = await svc.checkoutWithWallet(
    { cartId: cart.id, memberId: 'u1', walletService: walletSvc, acceptableUseAccepted: true },
    mockCtx
  );

  assert.equal(fulfilledOrder.status, 'fulfilled');
  assert.equal(fulfilledOrder.provider, 'wallet');
});
