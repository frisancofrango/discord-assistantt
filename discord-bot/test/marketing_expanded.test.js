import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketingService } from '../src/native/marketing.js';

function createMockMarketingDb() {
  const flashDrops = [];
  const reviews = [];

  return {
    flashDrops,
    reviews,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');

      if (lower.includes('insert into flash_drops')) {
        const row = {
          id: `drp_${flashDrops.length + 1}`,
          guild_id: params[0],
          title: params[1],
          variant_id: params[2],
          drop_price_minor: params[3],
          max_stock: params[4],
          claimed_stock: 0,
          expires_at: params[5],
          active: true,
        };
        flashDrops.push(row);
        return { rows: [row] };
      }

      if (lower.includes('from flash_drops where guild_id = $1 and active = true and expires_at > now()')) {
        const rows = flashDrops.filter((d) => d.guild_id === params[0] && d.active);
        return { rows };
      }

      if (lower.includes('from orders where id = $1')) {
        return { rows: [{ id: params[0], guild_id: 'g1', status: 'fulfilled' }] };
      }

      if (lower.includes('insert into order_reviews')) {
        const row = {
          id: `rev_${reviews.length + 1}`,
          order_id: params[0],
          guild_id: params[1],
          member_id: params[2],
          rating: params[3],
          comment: params[4],
          cashback_awarded_minor: params[5],
        };
        reviews.push(row);
        return { rows: [row] };
      }

      if (lower.includes('from order_reviews where guild_id = $1')) {
        const rows = reviews.filter((r) => r.guild_id === params[0]);
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

test('MarketingService: createFlashDrop creates active drop with countdown', async () => {
  const db = createMockMarketingDb();
  const svc = new MarketingService({ db });

  const drop = await svc.createFlashDrop(
    {
      guildId: 'g1',
      title: 'Midnight Blitz',
      variantId: 'v_vip',
      dropPriceMinor: 499,
      durationHours: 2,
    },
    mockCtx
  );

  assert.equal(drop.title, 'Midnight Blitz');
  assert.equal(drop.dropPriceMinor, 499);
  assert.ok(new Date(drop.expiresAt) > new Date());

  const list = await svc.listFlashDrops('g1');
  assert.equal(list.length, 1);
});

test('MarketingService: submitReview records review and awards wallet bonus', async () => {
  const db = createMockMarketingDb();
  const svc = new MarketingService({ db });

  let walletBonus = null;
  const mockWallet = {
    async deposit(data) {
      walletBonus = data;
    },
  };

  const rev = await svc.submitReview(
    {
      orderId: 'ord_123',
      guildId: 'g1',
      memberId: 'u99',
      rating: 5,
      comment: 'Super fast delivery and great support!',
      walletService: mockWallet,
    },
    mockCtx
  );

  assert.equal(rev.rating, 5);
  assert.equal(rev.cashbackAwardedMinor, 100);
  assert.equal(walletBonus?.amountMinor, 100);
});
