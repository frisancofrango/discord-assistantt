import test from 'node:test';
import assert from 'node:assert/strict';
import { SecurityService } from '../src/native/security.js';

function createMockSecurityDb() {
  const whitelist = new Map();
  const incidents = [];

  return {
    whitelist,
    incidents,
    async query(sql, params) {
      const lower = sql.toLowerCase();

      if (lower.includes('select 1 from security_whitelists')) {
        const row = whitelist.get(`${params[0]}:${params[1]}`);
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('insert into security_whitelists')) {
        const row = { guild_id: params[0], user_id: params[1], role: params[2], added_by: params[3], created_at: new Date() };
        whitelist.set(`${params[0]}:${params[1]}`, row);
        return { rows: [row] };
      }

      if (lower.includes('delete from security_whitelists')) {
        whitelist.delete(`${params[0]}:${params[1]}`);
        return { rows: [] };
      }

      if (lower.includes('select * from security_whitelists')) {
        const rows = [...whitelist.values()].filter((w) => w.guild_id === params[0]);
        return { rows };
      }

      if (lower.includes('insert into security_incidents')) {
        const row = {
          id: `inc_${incidents.length + 1}`,
          guild_id: params[0],
          actor_id: params[1],
          action: params[2],
          threshold: params[3],
          status: 'quarantined',
          metadata: typeof params[4] === 'string' ? JSON.parse(params[4]) : params[4],
          created_at: new Date(),
        };
        incidents.push(row);
        return { rows: [row] };
      }

      if (lower.includes('select * from security_incidents')) {
        const rows = incidents.filter((i) => i.guild_id === params[0]);
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
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true, permissions: ['Administrator'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('SecurityService: addWhitelist, isWhitelisted, and removeWhitelist manages trusted staff', async () => {
  const db = createMockSecurityDb();
  const svc = new SecurityService({ db });

  assert.equal(await svc.isWhitelisted('g1', 'u_trusted_1'), false);

  await svc.addWhitelist('g1', 'u_trusted_1', 'co_owner', 'u1', mockCtx);
  assert.equal(await svc.isWhitelisted('g1', 'u_trusted_1'), true);

  await svc.removeWhitelist('g1', 'u_trusted_1', mockCtx);
  assert.equal(await svc.isWhitelisted('g1', 'u_trusted_1'), false);
});

test('SecurityService: checkAntiNukeRate detects rate limit breaches within window', () => {
  const db = createMockSecurityDb();
  const svc = new SecurityService({ db });

  // Threshold: max 3 actions in 10s
  const r1 = svc.checkAntiNukeRate('g1', 'attacker_1', 'channel_delete', 3, 10);
  assert.equal(r1.exceeded, false);
  const r2 = svc.checkAntiNukeRate('g1', 'attacker_1', 'channel_delete', 3, 10);
  assert.equal(r2.exceeded, false);
  const r3 = svc.checkAntiNukeRate('g1', 'attacker_1', 'channel_delete', 3, 10);
  assert.equal(r3.exceeded, false);

  // 4th action -> breached!
  const r4 = svc.checkAntiNukeRate('g1', 'attacker_1', 'channel_delete', 3, 10);
  assert.equal(r4.exceeded, true);
  assert.equal(r4.count, 4);
});
