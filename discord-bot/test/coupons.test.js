import test from 'node:test';
import assert from 'node:assert/strict';
import { CouponService } from '../src/native/coupons.js';

function createMockCouponsDb() {
  const coupons = new Map();
  return {
    async query(sql, params) {
      const lower = sql.toLowerCase();
      if (lower.includes('insert into coupons')) {
        const row = {
          id: `cpn_${coupons.size + 1}`,
          guild_id: params[0],
          code: params[1],
          discount_percent: params[2],
          discount_minor: params[3],
          min_order_minor: params[4],
          max_uses: params[5],
          used_count: 0,
          active: true,
          expires_at: params[6],
          created_at: new Date(),
        };
        coupons.set(`${params[0]}:${params[1]}`, row);
        return { rows: [row] };
      }
      if (lower.includes('select * from coupons where guild_id = $1 and code = $2 and active = true')) {
        const row = coupons.get(`${params[0]}:${params[1]}`);
        return { rows: row && row.active ? [row] : [] };
      }
      if (lower.includes('update coupons set used_count = used_count + 1')) {
        for (const c of coupons.values()) {
          if (c.id === params[0]) {
            c.used_count += 1;
            return { rows: [c] };
          }
        }
      }
      if (lower.includes('select * from coupons where guild_id = $1')) {
        const rows = [...coupons.values()].filter((c) => c.guild_id === params[0]);
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
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true, permissions: ['ManageGuild'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('CouponService: creates percentage coupon and calculates valid discount', async () => {
  const db = createMockCouponsDb();
  const svc = new CouponService({ db });

  await svc.createCoupon({ guildId: 'g1', code: 'SUMMER20', discountPercent: 20, minOrderMinor: 1000 }, mockCtx);

  // $50.00 order with 20% off -> $10.00 discount -> $40.00 final
  const res = await svc.validateCoupon('g1', 'summer20', 5000);
  assert.equal(res.valid, true);
  assert.equal(res.discountMinor, 1000);
  assert.equal(res.finalTotalMinor, 4000);
});

test('CouponService: enforces minimum order amount', async () => {
  const db = createMockCouponsDb();
  const svc = new CouponService({ db });

  await svc.createCoupon({ guildId: 'g1', code: 'BIGDEAL', discountPercent: 50, minOrderMinor: 10000 }, mockCtx);

  await assert.rejects(
    () => svc.validateCoupon('g1', 'BIGDEAL', 5000), // $50 < $100 min order
    (err) => err.code === 'min_order_not_met'
  );
});
