import { authorize, NativeError, audit } from './core.js';

export class LicenseService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async addKeys(variantId, keys = [], ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'medium', financial: true, permissions: ['ManageGuild'] });

    if (!variantId || !keys.length) {
      throw new NativeError('invalid_keys', 'Variant ID and at least one key are required');
    }

    const cleanKeys = keys.map((k) => String(k).trim()).filter((k) => k.length > 0);
    let addedCount = 0;

    for (const k of cleanKeys) {
      const res = await this.db.query(
        `INSERT INTO product_license_keys (variant_id, license_key)
         VALUES ($1, $2)
         ON CONFLICT (variant_id, license_key) DO NOTHING RETURNING id`,
        [variantId, k]
      );
      if (res.rowCount > 0) addedCount++;
    }

    // Update variant stock to match unused key count if managed by keypool
    const unusedCount = (
      await this.db.query(
        `SELECT count(*)::int as count FROM product_license_keys WHERE variant_id = $1 AND NOT is_used`,
        [variantId]
      )
    ).rows[0]?.count || 0;

    await this.db.query(
      `UPDATE product_variants SET stock = $1, updated_at = now() WHERE id = $2`,
      [unusedCount, variantId]
    );

    await audit(this.db, ctx, {
      action: 'license.add_keys',
      domain: 'commerce',
      risk: 'medium',
      metadata: { variantId, addedCount, totalUnused: unusedCount },
    });

    return {
      variantId,
      addedCount,
      totalUnused: unusedCount,
    };
  }

  async getKeyPool(variantId) {
    const total = (
      await this.db.query(
        `SELECT count(*)::int as count FROM product_license_keys WHERE variant_id = $1`,
        [variantId]
      )
    ).rows[0]?.count || 0;

    const unused = (
      await this.db.query(
        `SELECT count(*)::int as count FROM product_license_keys WHERE variant_id = $1 AND NOT is_used`,
        [variantId]
      )
    ).rows[0]?.count || 0;

    return {
      variantId,
      totalKeys: total,
      unusedKeys: unused,
      claimedKeys: total - unused,
    };
  }

  async claimKey(variantId, orderId, userId) {
    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const row = (
        await c.query(
          `SELECT * FROM product_license_keys
           WHERE variant_id = $1 AND NOT is_used
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [variantId]
        )
      ).rows[0];

      if (!row) {
        await c.query('ROLLBACK');
        return null;
      }

      await c.query(
        `UPDATE product_license_keys
         SET is_used = true, order_id = $2, redeemed_by = $3, redeemed_at = now()
         WHERE id = $1`,
        [row.id, orderId, userId]
      );

      await c.query('COMMIT');
      return row.license_key;
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  }

  async listKeys(variantId, limit = 20) {
    const rows = (
      await this.db.query(
        `SELECT id, variant_id, license_key, is_used, order_id, redeemed_by, redeemed_at, created_at
         FROM product_license_keys WHERE variant_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [variantId, limit]
      )
    ).rows;

    return rows.map((r) => ({
      id: r.id,
      variantId: r.variant_id,
      licenseKey: r.is_used ? `${r.license_key.slice(0, 4)}****` : r.license_key,
      isUsed: r.is_used,
      orderId: r.order_id,
      redeemedBy: r.redeemed_by,
      redeemedAt: r.redeemed_at,
      createdAt: r.created_at,
    }));
  }
}
