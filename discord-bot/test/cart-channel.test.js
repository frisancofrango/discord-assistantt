import test from 'node:test';
import assert from 'node:assert/strict';
import { CartChannelService } from '../src/native/cart-channel.js';

function createMockCartChannelDb() {
  const configs = [];
  const activeChannels = [];
  return {
    configs,
    activeChannels,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes('insert into guild_commerce_channels')) {
        const row = {
          guild_id: params[0],
          cart_category_id: params[1],
          reviews_channel_id: params[2],
          logs_channel_id: params[3],
          ranking_channel_id: params[4],
          language: params[5],
          currency: params[6],
        };
        configs.push(row);
        return { rows: [row] };
      }
      if (lower.includes('select * from guild_commerce_channels where guild_id = $1')) {
        const row = configs.find((c) => c.guild_id === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (lower.includes('insert into active_cart_channels')) {
        const row = { id: `cch_${activeChannels.length + 1}`, guild_id: params[0], member_id: params[1], channel_id: params[2], status: 'open' };
        activeChannels.push(row);
        return { rows: [row] };
      }
      if (lower.includes('select * from active_cart_channels where guild_id = $1 and member_id = $2 and status = \'open\'')) {
        const row = activeChannels.find((c) => c.guild_id === params[0] && c.member_id === params[1] && c.status === 'open');
        return { rows: row ? [row] : [] };
      }
      if (lower.includes('update active_cart_channels set status = $1 where channel_id = $2')) {
        const row = activeChannels.find((c) => c.channel_id === params[1]);
        if (row) row.status = params[0];
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    },
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'admin_1', authenticated: true, guildMember: true, isOwner: true, permissions: ['ManageGuild'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('CartChannelService: setCommerceChannels and getCommerceChannels', async () => {
  const db = createMockCartChannelDb();
  const svc = new CartChannelService({ db });

  await svc.setCommerceChannels(
    'g1',
    {
      cartCategoryId: 'cat_123',
      reviewsChannelId: 'rev_456',
      currency: 'BRL',
      language: 'pt_BR',
    },
    mockCtx
  );

  const cfg = await svc.getCommerceChannels('g1');
  assert.equal(cfg.cart_category_id, 'cat_123');
  assert.equal(cfg.reviews_channel_id, 'rev_456');
  assert.equal(cfg.currency, 'BRL');
});

test('CartChannelService: getOrCreateCartChannel creates private channel and returns existing', async () => {
  const db = createMockCartChannelDb();
  const svc = new CartChannelService({ db });

  let channelCreated = null;
  const mockGuild = {
    id: 'g1',
    roles: { everyone: { id: 'everyone_role' } },
    client: { user: { id: 'bot_1' } },
    channels: {
      create: async (opts) => {
        channelCreated = { id: 'ch_new_999', ...opts };
        return channelCreated;
      },
      fetch: async (id) => (id === 'ch_new_999' ? channelCreated : null),
    },
  };

  const mockMember = { id: 'usr_1', user: { username: 'testuser' } };

  const result1 = await svc.getOrCreateCartChannel({ guild: mockGuild, member: mockMember, runtime: null, ctx: mockCtx });
  assert.equal(result1.created, true);
  assert.equal(result1.channel.id, 'ch_new_999');

  const result2 = await svc.getOrCreateCartChannel({ guild: mockGuild, member: mockMember, runtime: null, ctx: mockCtx });
  assert.equal(result2.created, false);
  assert.equal(result2.channel.id, 'ch_new_999');
});
