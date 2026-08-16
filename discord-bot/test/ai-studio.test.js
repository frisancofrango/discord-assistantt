import test from 'node:test';
import assert from 'node:assert/strict';
import { AIStudioService, AI_PERSONAS } from '../src/native/ai-studio.js';
import { SettingsService } from '../src/native/settings.js';

function createMockAiDb() {
  const nodes = [];
  const settingsStore = new Map();

  return {
    nodes,
    settingsStore,
    async query(sql, params) {
      const lower = sql.toLowerCase();

      if (lower.includes('select * from guild_settings')) {
        const row = settingsStore.get(params[0]);
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
        settingsStore.set(params[0], row);
        return { rows: [row] };
      }

      if (lower.includes('insert into ai_knowledge_nodes')) {
        const row = {
          id: `kn_${nodes.length + 1}`,
          guild_id: params[0],
          title: params[1],
          category: params[2],
          content: params[3],
          content_hash: params[4],
          created_at: new Date(),
        };
        nodes.push(row);
        return { rows: [row] };
      }

      if (lower.includes('select * from ai_knowledge_nodes')) {
        const rows = nodes.filter((n) => n.guild_id === params[0]);
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

test('AIStudioService: getPersona and setPersona manages active persona', async () => {
  const db = createMockAiDb();
  const settings = new SettingsService({ db });
  const svc = new AIStudioService({ db, settings });

  const initial = await svc.getPersona('g1');
  assert.equal(initial.personaKey, 'concierge');

  const updated = await svc.setPersona('g1', 'sales_closer', null, mockCtx);
  assert.equal(updated.personaKey, 'sales_closer');
  assert.equal(updated.name, AI_PERSONAS.sales_closer.name);
});

test('AIStudioService: ingestKnowledge saves nodes into database and vector memory', async () => {
  const db = createMockAiDb();
  const settings = new SettingsService({ db });
  const remembered = [];
  const mockMemory = {
    remember: async (item) => remembered.push(item),
  };

  const svc = new AIStudioService({ db, settings, memory: mockMemory });

  const node = await svc.ingestKnowledge(
    {
      guildId: 'g1',
      title: 'Refund Policy',
      category: 'rules',
      content: 'Digital goods are non-refundable after instant key reveal.',
    },
    mockCtx
  );

  assert.equal(node.title, 'Refund Policy');
  assert.equal(node.category, 'rules');
  assert.equal(remembered.length, 1);
  assert.match(remembered[0].text, /Refund Policy/);

  const list = await svc.listKnowledgeNodes('g1');
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Refund Policy');
});
