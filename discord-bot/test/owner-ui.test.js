import test from 'node:test';
import assert from 'node:assert/strict';
import { healthPanel, budgetPanel, approvalsPanel, policiesPanel, memoryPanel, KINDS } from '../src/ui/owner.js';
import { diffPanel, settingsPanel } from '../src/autonomy/ui.js';
import { MessageFlags } from 'discord.js';
import adminCommand from '../src/commands/admin.js';
import helpCommand from '../src/commands/help.js';

const flags = (panel) => panel.flags;
const ids = (panel) => JSON.stringify(panel).match(/"custom_id":"([^"]+)"/g)?.map((s) => s.slice(13, -1)) ?? [];

test('owner panels are Components V2 and carry owner button ids', () => {
  const health = healthPanel({ database: true, redis: true, memory: { enabled: true, model: 'nomic-embed-text-v1.5', dimensions: 768, total: 5 }, models: { primary: { circuitOpen: false, calls: 3, failures: 0 } }, observedAt: 'now' });
  assert.equal(flags(health), MessageFlags.IsComponentsV2);
  assert.ok(ids(health).includes('adm:refresh:health'));
  assert.ok(ids(health).includes('adm:close'));
  const memory = memoryPanel({ enabled: true, model: 'x', dimensions: 768, total: 2, byKind: [], recent: [{ content: 'a' }] });
  assert.ok(ids(memory).includes('adm:wipe:all'));
});

test('owner panels render empty states without throwing', () => {
  for (const fn of [healthPanel, budgetPanel, approvalsPanel, policiesPanel, memoryPanel]) {
    const panel = fn({ memory: { enabled: false, model: 'n/a', dimensions: 0, total: 0, byKind: [] }, models: {}, spent: 0, limit: 0, byCapability: [], reservations: [], rows: [], recent: [], byKind: [], observedAt: 'now', periodStart: 'now' });
    assert.ok(panel.components.length === 1);
    assert.equal(flags(panel), MessageFlags.IsComponentsV2);
  }
});

test('diff and settings panels render step and policy detail', () => {
  const diff = diffPanel({ goal: 'restructure', machinePlan: { steps: [{ id: 's1', tool: 'role.update', title: 'Update role', risk: 'high', irreversible: true, input: { name: 'mod' } }] }, diff: { changes: [{ op: 'tool', path: '/stages/1/s1' }] } });
  assert.match(JSON.stringify(diff), /role\.update/);
  const settings = settingsPanel({ policies: [{ domain: 'moderation', level: 'operator' }] });
  assert.match(JSON.stringify(settings), /moderation/);
});

test('admin command declares owner-only subcommands', () => {
  const json = adminCommand.data.toJSON();
  assert.equal(json.name, 'admin');
  assert.deepEqual(json.options.map((o) => o.name), ['health', 'budget', 'approvals', 'policies', 'memory']);
  assert.ok(json.default_member_permissions);
  assert.deepEqual(Object.keys(KINDS), ['health', 'budget', 'approvals', 'policies', 'memory']);
});

test('help command is registered and self-describing', () => {
  assert.equal(helpCommand.data.name, 'help');
  assert.match(helpCommand.data.description, /List Loop commands/);
});

test('operatorDashboardPanel renders all 5 nested categories without throwing', async () => {
  const { operatorDashboardPanel } = await import('../src/ui/theme.js');
  const categories = ['commerce', 'economy', 'ai', 'support', 'security'];

  for (const cat of categories) {
    const p = operatorDashboardPanel({
      category: cat,
      guildId: '123456',
      data: {
        products: [{ sku: 'test_item', name: 'Test Item', variants: [{ priceMinor: 1000, currency: 'BRL', stock: 5 }] }],
        coupons: [],
        pixConfig: { enabled: true, pix_key: 'test@pix.br' },
        commerceChannels: { currency: 'BRL', language: 'pt_BR' },
        vendorsCount: 1,
      },
      settings: { aiPersona: 'concierge', aiAutonomy: 'operator', antiRaidLevel: 'standard' },
    });

    assert.ok(p.components.length > 0);
  }
});