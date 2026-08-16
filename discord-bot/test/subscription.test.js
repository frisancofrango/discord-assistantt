import test from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionService } from '../src/native/subscription.js';

function createMockSubDb() {
  const subs = [];
  return {
    subs,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes('insert into member_role_subscriptions')) {
        const row = {
          id: `sub_${subs.length + 1}`,
          guild_id: params[0],
          member_id: params[1],
          role_id: params[2],
          order_id: params[3],
          expires_at: params[4],
          status: 'active',
          created_at: new Date(),
        };
        subs.push(row);
        return { rows: [row] };
      }
      if (lower.includes('select * from member_role_subscriptions where status = \'active\' and expires_at <= now()')) {
        const now = new Date();
        const expired = subs.filter((s) => s.status === 'active' && new Date(s.expires_at) <= now);
        return { rows: expired };
      }
      if (lower.includes('update member_role_subscriptions set status = \'expired\'')) {
        const row = subs.find((s) => s.id === params[0]);
        if (row) row.status = 'expired';
        return { rows: row ? [row] : [] };
      }
      if (lower.includes('select * from member_role_subscriptions where guild_id = $1 and member_id = $2')) {
        const rows = subs.filter((s) => s.guild_id === params[0] && s.member_id === params[1]);
        return { rows };
      }
      return { rows: [] };
    },
  };
}

test('SubscriptionService: grantRoleSubscription and getMemberSubscriptions', async () => {
  const db = createMockSubDb();
  const svc = new SubscriptionService({ db });

  const sub = await svc.grantRoleSubscription(
    {
      guildId: 'g1',
      memberId: 'm1',
      roleId: 'r_vip',
      durationDays: 30,
    },
    { guilds: { fetch: async () => null } }
  );

  assert.equal(sub.guildId, 'g1');
  assert.equal(sub.memberId, 'm1');
  assert.equal(sub.roleId, 'r_vip');
  assert.equal(sub.status, 'active');

  const history = await svc.getMemberSubscriptions('g1', 'm1');
  assert.equal(history.length, 1);
  assert.equal(history[0].role_id, 'r_vip');
});
