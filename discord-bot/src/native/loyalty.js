import { authorize, audit } from './core.js';

export const DEFAULT_LOYALTY_TIERS = [
  { tierName: 'Bronze', minSpendMinor: 1000, cashbackPercent: 1 },
  { tierName: 'Silver', minSpendMinor: 5000, cashbackPercent: 2 },
  { tierName: 'Gold', minSpendMinor: 15000, cashbackPercent: 4 },
  { tierName: 'Diamond', minSpendMinor: 50000, cashbackPercent: 7 },
  { tierName: 'Obsidian', minSpendMinor: 100000, cashbackPercent: 10 },
];

export class LoyaltyService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async getMemberLoyalty(guildId, userId) {
    const row = (
      await this.db.query(
        `SELECT * FROM member_loyalty WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
      )
    ).rows[0];

    const lifetimeSpentMinor = Number(row?.lifetime_spent_minor || 0);
    const totalCashbackMinor = Number(row?.total_cashback_minor || 0);
    const currentTier = this.calculateTier(lifetimeSpentMinor);

    return {
      guildId,
      userId,
      lifetimeSpentMinor,
      currentTier: currentTier.tierName,
      cashbackPercent: currentTier.cashbackPercent,
      totalCashbackMinor,
      nextTier: currentTier.nextTier,
      remainingForNextTierMinor: currentTier.remainingMinor,
    };
  }

  calculateTier(lifetimeSpentMinor) {
    let current = { tierName: 'Member', cashbackPercent: 0 };
    let nextTier = DEFAULT_LOYALTY_TIERS[0];
    let remainingMinor = DEFAULT_LOYALTY_TIERS[0].minSpendMinor - lifetimeSpentMinor;

    for (let i = 0; i < DEFAULT_LOYALTY_TIERS.length; i++) {
      const t = DEFAULT_LOYALTY_TIERS[i];
      if (lifetimeSpentMinor >= t.minSpendMinor) {
        current = t;
        nextTier = DEFAULT_LOYALTY_TIERS[i + 1] || null;
        remainingMinor = nextTier ? nextTier.minSpendMinor - lifetimeSpentMinor : 0;
      }
    }

    return {
      tierName: current.tierName,
      cashbackPercent: current.cashbackPercent,
      nextTier: nextTier?.tierName || 'MAX TIER',
      remainingMinor: Math.max(0, remainingMinor),
    };
  }

  async recordPurchaseAndCalculateCashback(guildId, userId, amountMinor, walletService, ctx) {
    const amount = Number(amountMinor);
    const prev = await this.getMemberLoyalty(guildId, userId);
    const newSpent = prev.lifetimeSpentMinor + amount;
    const tier = this.calculateTier(newSpent);

    const cashbackMinor = tier.cashbackPercent > 0 ? Math.round((amount * tier.cashbackPercent) / 100) : 0;

    await this.db.query(
      `INSERT INTO member_loyalty (guild_id, user_id, lifetime_spent_minor, current_tier, total_cashback_minor, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         lifetime_spent_minor = member_loyalty.lifetime_spent_minor + $6,
         current_tier = $4,
         total_cashback_minor = member_loyalty.total_cashback_minor + $5,
         updated_at = now()`,
      [guildId, userId, newSpent, tier.tierName, cashbackMinor, amount]
    );

    // Auto-credit cashback to digital wallet
    if (cashbackMinor > 0 && walletService) {
      await walletService.deposit(
        {
          guildId,
          memberId: userId,
          amountMinor: cashbackMinor,
          currency: 'USD',
          reference: `loyalty_cashback:${tier.tierName}`,
        },
        ctx
      ).catch((err) => this.logger?.warn({ err: err.message }, 'failed to deposit loyalty cashback'));
    }

    return {
      userId,
      newLifetimeSpentMinor: newSpent,
      currentTier: tier.tierName,
      cashbackEarnedMinor: cashbackMinor,
      cashbackPercent: tier.cashbackPercent,
    };
  }

  async getLeaderboard(guildId, limit = 10) {
    const rows = (
      await this.db.query(
        `SELECT user_id, lifetime_spent_minor, current_tier, total_cashback_minor
         FROM member_loyalty WHERE guild_id = $1 ORDER BY lifetime_spent_minor DESC LIMIT $2`,
        [guildId, limit]
      )
    ).rows;

    return rows.map((r, idx) => ({
      rank: idx + 1,
      userId: r.user_id,
      lifetimeSpentMinor: Number(r.lifetime_spent_minor),
      currentTier: r.current_tier,
      totalCashbackMinor: Number(r.total_cashback_minor),
    }));
  }
}
