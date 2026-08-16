import test from 'node:test';
import assert from 'node:assert/strict';
import { LoyaltyService } from '../src/native/loyalty.js';

function createMockLoyaltyDb() {
  const loyaltyMap = new Map();

  return {
    loyaltyMap,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');

      if (lower.includes('from member_loyalty where guild_id = $1 and user_id = $2')) {
        const row = loyaltyMap.get(`${params[0]}:${params[1]}`);
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('insert into member_loyalty')) {
        const key = `${params[0]}:${params[1]}`;
        const existing = loyaltyMap.get(key);
        const spent = (existing?.lifetime_spent_minor || 0) + params[2];
        const cashback = (existing?.total_cashback_minor || 0) + params[4];
        const row = {
          guild_id: params[0],
          user_id: params[1],
          lifetime_spent_minor: spent,
          current_tier: params[3],
          total_cashback_minor: cashback,
        };
        loyaltyMap.set(key, row);
        return { rows: [row] };
      }

      if (lower.includes('from member_loyalty where guild_id = $1 order by lifetime_spent_minor desc')) {
        const rows = [...loyaltyMap.values()].filter((r) => r.guild_id === params[0]);
        return { rows };
      }

      return { rows: [] };
    },
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true, permissions: ['ManageGuild'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('LoyaltyService: getMemberLoyalty defaults to Member tier with 0 spend', async () => {
  const db = createMockLoyaltyDb();
  const svc = new LoyaltyService({ db });

  const res = await svc.getMemberLoyalty('g1', 'u10');
  assert.equal(res.currentTier, 'Member');
  assert.equal(res.cashbackPercent, 0);
  assert.equal(res.nextTier, 'Bronze');
});

test('LoyaltyService: recordPurchaseAndCalculateCashback updates tier and computes cashback', async () => {
  const db = createMockLoyaltyDb();
  const svc = new LoyaltyService({ db });

  let walletDeposited = null;
  const mockWalletService = {
    async deposit(data) {
      walletDeposited = data;
    },
  };

  // $150.00 purchase -> Gold tier (4% cashback)
  const res = await svc.recordPurchaseAndCalculateCashback('g1', 'u10', 15000, mockWalletService, mockCtx);
  assert.equal(res.currentTier, 'Gold');
  assert.equal(res.cashbackPercent, 4);
  assert.equal(res.cashbackEarnedMinor, 600); // 4% of $150 = $6.00 (600 cents)
  assert.equal(walletDeposited?.amountMinor, 600);
});
