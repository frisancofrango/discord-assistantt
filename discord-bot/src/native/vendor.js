import { authorize, audit } from './core.js';

export class VendorService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async setVendor(productId, vendorUserId, commissionPercent = 10, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'low', financial: true, permissions: ['ManageGuild'] });

    const row = (
      await this.db.query(
        `INSERT INTO product_vendors (product_id, vendor_user_id, commission_percent, created_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (product_id) DO UPDATE SET
           vendor_user_id = EXCLUDED.vendor_user_id,
           commission_percent = EXCLUDED.commission_percent
         RETURNING *`,
        [productId, vendorUserId, commissionPercent]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'vendor.set_assignment',
      domain: 'commerce',
      risk: 'low',
      metadata: { productId, vendorUserId, commissionPercent },
    });

    return row;
  }

  async getVendor(productId) {
    const row = (
      await this.db.query(`SELECT * FROM product_vendors WHERE product_id = $1`, [productId])
    ).rows[0];
    return row;
  }

  async processVendorSplit({ productId, guildId, totalAmountMinor, currency = 'BRL', walletService, ctx }) {
    const vendor = await this.getVendor(productId);
    if (!vendor) return null;

    const commissionPercent = vendor.commission_percent || 10;
    const platformCut = Math.round(totalAmountMinor * (commissionPercent / 100));
    const vendorEarnings = totalAmountMinor - platformCut;

    if (vendorEarnings > 0 && walletService) {
      await walletService.deposit(
        {
          guildId,
          memberId: vendor.vendor_user_id,
          amountMinor: vendorEarnings,
          currency,
          reference: `vendor_payout:${productId}`,
        },
        ctx
      );
    }

    return {
      vendorId: vendor.vendor_user_id,
      totalMinor: totalAmountMinor,
      platformCutMinor: platformCut,
      vendorEarningsMinor: vendorEarnings,
      currency,
    };
  }
}
