import { authorize, NativeError, audit } from './core.js';

export class CouponService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async createCoupon({ guildId, code, discountPercent, discountMinor, minOrderMinor = 0, maxUses = null, expiresAt = null }, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'medium', financial: true, permissions: ['ManageGuild'] });

    const cleanCode = String(code).trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3) {
      throw new NativeError('invalid_coupon', 'Coupon code must be at least 3 characters');
    }

    if (!discountPercent && !discountMinor) {
      throw new NativeError('invalid_coupon', 'Must specify either discount percent or discount amount');
    }

    const row = (
      await this.db.query(
        `INSERT INTO coupons (guild_id, code, discount_percent, discount_minor, min_order_minor, max_uses, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (guild_id, code) DO UPDATE SET
           discount_percent = EXCLUDED.discount_percent,
           discount_minor = EXCLUDED.discount_minor,
           min_order_minor = EXCLUDED.min_order_minor,
           max_uses = EXCLUDED.max_uses,
           expires_at = EXCLUDED.expires_at,
           active = true
         RETURNING *`,
        [guildId, cleanCode, discountPercent || null, discountMinor || null, Number(minOrderMinor) || 0, maxUses ? Number(maxUses) : null, expiresAt ? new Date(expiresAt) : null]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'coupon.create',
      domain: 'commerce',
      risk: 'medium',
      metadata: { code: cleanCode, discountPercent, discountMinor },
    });

    return {
      id: row.id,
      guildId: row.guild_id,
      code: row.code,
      discountPercent: row.discount_percent,
      discountMinor: row.discount_minor ? Number(row.discount_minor) : null,
      minOrderMinor: Number(row.min_order_minor),
      maxUses: row.max_uses,
      usedCount: row.used_count,
      active: row.active,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async validateCoupon(guildId, code, orderTotalMinor) {
    const cleanCode = String(code).trim().toUpperCase();
    const row = (
      await this.db.query(
        `SELECT * FROM coupons WHERE guild_id = $1 AND code = $2 AND active = true`,
        [guildId, cleanCode]
      )
    ).rows[0];

    if (!row) {
      throw new NativeError('invalid_coupon', 'Promo code not found or inactive');
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      throw new NativeError('coupon_expired', 'This promo code has expired');
    }

    if (row.max_uses && row.used_count >= row.max_uses) {
      throw new NativeError('coupon_depleted', 'This promo code has reached its maximum redemptions');
    }

    const orderTotal = Number(orderTotalMinor);
    if (orderTotal < Number(row.min_order_minor)) {
      throw new NativeError('min_order_not_met', `Order total must be at least $${(row.min_order_minor / 100).toFixed(2)} to use this code`);
    }

    let discountMinor = 0;
    if (row.discount_percent) {
      discountMinor = Math.round((orderTotal * row.discount_percent) / 100);
    } else if (row.discount_minor) {
      discountMinor = Math.min(orderTotal, Number(row.discount_minor));
    }

    const finalTotalMinor = Math.max(0, orderTotal - discountMinor);

    return {
      valid: true,
      couponId: row.id,
      code: row.code,
      discountPercent: row.discount_percent,
      discountMinor,
      originalTotalMinor: orderTotal,
      finalTotalMinor,
    };
  }

  async redeemCoupon(couponId) {
    await this.db.query(
      `UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`,
      [couponId]
    );
  }

  async listCoupons(guildId) {
    const rows = (
      await this.db.query(
        `SELECT * FROM coupons WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [guildId]
      )
    ).rows;

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      discountPercent: r.discount_percent,
      discountMinor: r.discount_minor ? Number(r.discount_minor) : null,
      minOrderMinor: Number(r.min_order_minor),
      maxUses: r.max_uses,
      usedCount: r.used_count,
      active: r.active,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  }

  async deleteCoupon(guildId, couponId, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'medium', financial: true, permissions: ['ManageGuild'] });

    await this.db.query(
      `UPDATE coupons SET active = false WHERE id = $1 AND guild_id = $2`,
      [couponId, guildId]
    );

    await audit(this.db, ctx, {
      action: 'coupon.delete',
      domain: 'commerce',
      risk: 'medium',
      metadata: { couponId },
    });

    return { success: true };
  }
}
