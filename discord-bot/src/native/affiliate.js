import { authorize, NativeError, audit } from './core.js';

export class AffiliateService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async getOrCreateReferralCode(guildId, userId, customCode = null, commissionPercent = 10) {
    const existing = (
      await this.db.query(
        `SELECT * FROM referral_codes WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
      )
    ).rows[0];

    if (existing) {
      return {
        id: existing.id,
        code: existing.code,
        commissionPercent: existing.commission_percent,
        totalEarningsMinor: Number(existing.total_earnings_minor),
        totalReferrals: existing.total_referrals,
        createdAt: existing.created_at,
      };
    }

    const code = (customCode || `REF_${userId.slice(-4)}_${Math.random().toString(36).slice(2, 6)}`).toUpperCase();

    const row = (
      await this.db.query(
        `INSERT INTO referral_codes (guild_id, user_id, code, commission_percent)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, code) DO UPDATE SET code = $3 || '_' || substr(md5(random()::text), 1, 3)
         RETURNING *`,
        [guildId, userId, code, commissionPercent]
      )
    ).rows[0];

    return {
      id: row.id,
      code: row.code,
      commissionPercent: row.commission_percent,
      totalEarningsMinor: Number(row.total_earnings_minor),
      totalReferrals: row.total_referrals,
      createdAt: row.created_at,
    };
  }

  async getReferralByCode(guildId, code) {
    const cleanCode = String(code).trim().toUpperCase();
    const row = (
      await this.db.query(
        `SELECT * FROM referral_codes WHERE guild_id = $1 AND code = $2`,
        [guildId, cleanCode]
      )
    ).rows[0];

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      code: row.code,
      commissionPercent: row.commission_percent,
    };
  }

  async processOrderCommission({ orderId, buyerId, guildId, referralCode, orderAmountMinor, currency = 'USD', walletService }, ctx) {
    if (!referralCode) return null;

    const ref = await this.getReferralByCode(guildId, referralCode);
    if (!ref || ref.userId === buyerId) return null; // Prevent self-referral

    const orderAmount = Number(orderAmountMinor);
    const commissionMinor = Math.round((orderAmount * ref.commissionPercent) / 100);

    if (commissionMinor <= 0) return null;

    // Record commission record
    await this.db.query(
      `INSERT INTO referral_commissions (referral_code_id, order_id, buyer_id, referrer_id, order_amount_minor, commission_amount_minor, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ref.id, orderId, buyerId, ref.userId, orderAmount, commissionMinor, currency]
    );

    // Update referral code metrics
    await this.db.query(
      `UPDATE referral_codes
       SET total_earnings_minor = total_earnings_minor + $1,
           total_referrals = total_referrals + 1
       WHERE id = $2`,
      [commissionMinor, ref.id]
    );

    // Credit referrer's wallet
    if (walletService) {
      await walletService.deposit(
        {
          guildId,
          memberId: ref.userId,
          amountMinor: commissionMinor,
          currency,
          reference: `affiliate_commission:${orderId}`,
        },
        ctx
      ).catch((err) => this.logger?.warn({ err: err.message }, 'failed to deposit affiliate commission to wallet'));
    }

    await audit(this.db, ctx, {
      action: 'affiliate.commission_awarded',
      domain: 'commerce',
      risk: 'low',
      metadata: { referrerId: ref.userId, buyerId, commissionMinor, currency },
    });

    return {
      referrerId: ref.userId,
      commissionMinor,
      currency,
    };
  }

  async listUserReferrals(guildId, userId) {
    const rows = (
      await this.db.query(
        `SELECT rc.*, c.created_at as earned_at
         FROM referral_commissions rc
         JOIN referral_codes c ON c.id = rc.referral_code_id
         WHERE c.guild_id = $1 AND c.user_id = $2
         ORDER BY rc.created_at DESC LIMIT 20`,
        [guildId, userId]
      )
    ).rows;

    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      buyerId: r.buyer_id,
      commissionAmountMinor: Number(r.commission_amount_minor),
      currency: r.currency,
      createdAt: r.created_at,
    }));
  }
}
