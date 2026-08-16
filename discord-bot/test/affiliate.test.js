import test from 'node:test';
import assert from 'node:assert/strict';
import { AffiliateService } from '../src/native/affiliate.js';

function createMockAffiliateDb() {
  const codes = [];
  const commissions = [];

  return {
    codes,
    commissions,
    async query(sql, params) {
      const lower = sql.toLowerCase();

      if (lower.includes('select * from referral_codes where guild_id = $1 and user_id = $2')) {
        const row = codes.find((c) => c.guild_id === params[0] && c.user_id === params[1]);
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('select * from referral_codes where guild_id = $1 and code = $2')) {
        const row = codes.find((c) => c.guild_id === params[0] && c.code === params[1]);
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('insert into referral_codes')) {
        const row = {
          id: `ref_${codes.length + 1}`,
          guild_id: params[0],
          user_id: params[1],
          code: params[2],
          commission_percent: params[3],
          total_earnings_minor: 0,
          total_referrals: 0,
          created_at: new Date(),
        };
        codes.push(row);
        return { rows: [row] };
      }

      if (lower.includes('insert into referral_commissions')) {
        const row = {
          id: `rcm_${commissions.length + 1}`,
          referral_code_id: params[0],
          order_id: params[1],
          buyer_id: params[2],
          referrer_id: params[3],
          order_amount_minor: params[4],
          commission_amount_minor: params[5],
          currency: params[6],
          created_at: new Date(),
        };
        commissions.push(row);
        return { rows: [row] };
      }

      if (lower.includes('update referral_codes set total_earnings_minor')) {
        const row = codes.find((c) => c.id === params[1]);
        if (row) {
          row.total_earnings_minor += params[0];
          row.total_referrals += 1;
        }
        return { rows: [row] };
      }

      if (lower.includes('select rc.*, c.created_at as earned_at')) {
        const rows = commissions.filter((rc) => rc.referrer_id === params[1]);
        return { rows };
      }

      if (lower.includes('insert into audit')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('AffiliateService: getOrCreateReferralCode generates and returns code', async () => {
  const db = createMockAffiliateDb();
  const svc = new AffiliateService({ db });

  const ref = await svc.getOrCreateReferralCode('g1', 'u_seller_1', 'TOPAFFILIATE', 15);
  assert.equal(ref.code, 'TOPAFFILIATE');
  assert.equal(ref.commissionPercent, 15);

  const lookup = await svc.getReferralByCode('g1', 'topaffiliate');
  assert.equal(lookup.userId, 'u_seller_1');
});

test('AffiliateService: processOrderCommission calculates % cut and credits referrer wallet', async () => {
  const db = createMockAffiliateDb();
  const deposits = [];
  const mockWallet = {
    deposit: async (args) => deposits.push(args),
  };

  const svc = new AffiliateService({ db });
  await svc.getOrCreateReferralCode('g1', 'u_referrer', 'SAVE10', 10);

  // $100.00 purchase -> 10% = $10.00 commission
  const result = await svc.processOrderCommission(
    {
      orderId: 'ord_123',
      buyerId: 'u_buyer_99',
      guildId: 'g1',
      referralCode: 'SAVE10',
      orderAmountMinor: 10000,
      currency: 'USD',
      walletService: mockWallet,
    },
    mockCtx
  );

  assert.equal(result.referrerId, 'u_referrer');
  assert.equal(result.commissionMinor, 1000);
  assert.equal(deposits.length, 1);
  assert.equal(deposits[0].amountMinor, 1000);
  assert.equal(deposits[0].memberId, 'u_referrer');
});
