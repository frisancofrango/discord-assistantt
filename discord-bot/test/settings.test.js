import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsService, DEFAULT_SETTINGS } from '../src/native/settings.js';

function createMockSettingsDb() {
  const store = new Map();
  return {
    async query(sql, params) {
      const lower = sql.toLowerCase();
      if (lower.includes('select * from guild_settings')) {
        const row = store.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      if (lower.includes('insert into guild_settings')) {
        const row = {
          guild_id: params[0],
          anti_raid_level: params[1],
          verification_mode: params[2],
          ai_persona: params[3],
          ai_autonomy: params[4],
          default_currency: params[5],
          coupons_enabled: params[6],
          cashback_percent: params[7],
          log_channel_id: params[8],
          ticket_category_id: params[9],
          metadata: typeof params[10] === 'string' ? JSON.parse(params[10]) : params[10],
          updated_at: new Date(),
        };
        store.set(params[0], row);
        return { rows: [row] };
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

test('SettingsService: getSettings returns default configuration if not set', async () => {
  const db = createMockSettingsDb();
  const svc = new SettingsService({ db });

  const s = await svc.getSettings('g1');
  assert.equal(s.antiRaidLevel, DEFAULT_SETTINGS.antiRaidLevel);
  assert.equal(s.verificationMode, DEFAULT_SETTINGS.verificationMode);
  assert.equal(s.aiPersona, DEFAULT_SETTINGS.aiPersona);
});

test('SettingsService: updateSettings updates and caches server settings', async () => {
  const db = createMockSettingsDb();
  const svc = new SettingsService({ db });

  const updated = await svc.updateSettings('g1', { antiRaidLevel: 'fortress', aiPersona: 'sales_closer' }, mockCtx);
  assert.equal(updated.antiRaidLevel, 'fortress');
  assert.equal(updated.aiPersona, 'sales_closer');

  const cached = await svc.getSettings('g1');
  assert.equal(cached.antiRaidLevel, 'fortress');
});
