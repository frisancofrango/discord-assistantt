import test from 'node:test';
import assert from 'node:assert/strict';
import { BackupService } from '../src/native/backup.js';

function createMockBackupDb() {
  const backups = [];
  const oauthMembers = new Map();

  return {
    backups,
    oauthMembers,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');

      if (lower.includes('insert into server_backups')) {
        const row = {
          id: `bkp_${backups.length + 1}`,
          guild_id: params[0],
          name: params[1],
          creator_id: params[2],
          channel_count: params[3],
          role_count: params[4],
          snapshot: typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5],
          created_at: new Date(),
        };
        backups.push(row);
        return { rows: [row] };
      }

      if (lower.includes('from server_backups where guild_id = $1')) {
        const rows = backups.filter((b) => b.guild_id === params[0]);
        return { rows };
      }

      if (lower.includes('select * from server_backups where id = $1')) {
        const row = backups.find((b) => b.id === params[0]);
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('insert into oauth_members')) {
        const key = `${params[0]}:${params[1]}`;
        const row = {
          guild_id: params[0],
          user_id: params[1],
          access_token: params[2],
          refresh_token: params[3],
          expires_at: params[4],
          ip_address: params[5],
          created_at: new Date(),
        };
        oauthMembers.set(key, row);
        return { rows: [row] };
      }

      if (lower.includes('from oauth_members where guild_id = $1 and expires_at > now()')) {
        const rows = [...oauthMembers.values()].filter((m) => m.guild_id === params[0]);
        return { rows: [{ count: rows.length }] };
      }

      if (lower.includes('from oauth_members where guild_id = $1')) {
        const rows = [...oauthMembers.values()].filter((m) => m.guild_id === params[0]);
        return { rows: [{ count: rows.length }] };
      }

      if (lower.includes('insert into audit')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

const mockGuild = {
  id: 'g1',
  name: 'Test Server',
  iconURL: () => 'https://cdn.discordapp.com/icons/g1/icon.png',
  afkChannelId: null,
  afkTimeout: 300,
  systemChannelId: null,
  channels: {
    fetch: async () => [
      { id: 'c1', name: 'general', type: 0, position: 0, permissionOverwrites: { cache: [] } },
      { id: 'c2', name: 'announcements', type: 0, position: 1, permissionOverwrites: { cache: [] } },
    ],
  },
  roles: {
    cache: [],
    fetch: async () => [
      { id: 'r1', name: 'VIP', color: 0xffd700, hoist: true, position: 1, permissions: { bitfield: 8n }, mentionable: true, managed: false },
    ],
    create: async (data) => ({ id: `new_${data.name}`, ...data }),
  },
};

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true, permissions: ['Administrator'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('BackupService: createSnapshot serializes server channels and roles', async () => {
  const db = createMockBackupDb();
  const svc = new BackupService({ db });

  const result = await svc.createSnapshot(mockGuild, 'u1', 'Launch_Backup', mockCtx);
  assert.equal(result.name, 'Launch_Backup');
  assert.equal(result.channelCount, 2);
  assert.equal(result.roleCount, 1);

  const list = await svc.listBackups('g1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, result.id);
});

test('BackupService: saveOAuthMember and getOAuthStats tracks backed-up members', async () => {
  const db = createMockBackupDb();
  const svc = new BackupService({ db });

  await svc.saveOAuthMember({
    guildId: 'g1',
    userId: 'u_oauth_1',
    accessToken: 'tok_abc',
    refreshToken: 'ref_123',
    expiresAt: new Date(Date.now() + 86400000),
    ipAddress: '127.0.0.1',
  });

  const stats = await svc.getOAuthStats('g1');
  assert.equal(stats.totalMembersBackedUp, 1);
  assert.equal(stats.activeTokensCount, 1);
});
