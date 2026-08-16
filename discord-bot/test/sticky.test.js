import test from 'node:test';
import assert from 'node:assert/strict';
import { StickyService } from '../src/native/sticky.js';

function createMockStickyDb() {
  const stickies = [];
  return {
    stickies,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes('insert into sticky_messages')) {
        const existing = stickies.find((s) => s.channel_id === params[0]);
        if (existing) {
          existing.title = params[2];
          existing.content = params[3];
          return { rows: [existing] };
        }
        const row = { channel_id: params[0], guild_id: params[1], title: params[2], content: params[3], enabled: true };
        stickies.push(row);
        return { rows: [row] };
      }
      if (lower.includes('select * from sticky_messages where channel_id = $1')) {
        const row = stickies.find((s) => s.channel_id === params[0] && s.enabled);
        return { rows: row ? [row] : [] };
      }
      if (lower.includes('delete from sticky_messages where channel_id = $1')) {
        const idx = stickies.findIndex((s) => s.channel_id === params[0]);
        if (idx >= 0) {
          const removed = stickies.splice(idx, 1);
          return { rows: removed };
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'admin_1', authenticated: true, guildMember: true, isOwner: true, permissions: ['ManageMessages'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('StickyService: setSticky, getSticky, and clearSticky', async () => {
  const db = createMockStickyDb();
  const svc = new StickyService({ db });

  await svc.setSticky('g1', 'ch_rules', 'SERVER RULES', '1. Be respectful\n2. No spam', mockCtx);
  const sticky = await svc.getSticky('ch_rules');
  assert.equal(sticky.title, 'SERVER RULES');

  const cleared = await svc.clearSticky('ch_rules', mockCtx);
  assert.equal(cleared, true);

  const after = await svc.getSticky('ch_rules');
  assert.equal(after, undefined);
});
