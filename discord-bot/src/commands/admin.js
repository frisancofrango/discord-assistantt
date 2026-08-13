import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { correlationId } from '../foundation/logger.js';
import { healthPanel, budgetPanel, approvalsPanel, policiesPanel, memoryPanel, KINDS } from '../ui/owner.js';

const SECTIONS = new Set(Object.keys(KINDS));

/**
 * Owner-only Azure console. Each subcommand renders a monochrome Components V2
 * panel backed by live runtime state; panels carry Refresh / Close buttons.
 */
export default {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Azure owner console: health, budget, approvals, policies, memory.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('health').setDescription('System health, model health, memory status.'))
    .addSubcommand((s) => s.setName('budget').setDescription('Agent spend vs budget and reservations.'))
    .addSubcommand((s) => s.setName('approvals').setDescription('Proposals awaiting owner decision.'))
    .addSubcommand((s) => s.setName('policies').setDescription('Per-domain autonomy policies.'))
    .addSubcommand((s) => s.setName('memory').setDescription('Semantic memory (RAG) status and recent rows.')),
  async execute(interaction, client) {
    if (!interaction.inGuild() || interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'Only the server owner can open the Azure console.', ephemeral: true });
    }
    const section = interaction.options.getSubcommand(true);
    await interaction.deferReply({ ephemeral: true });
    const view = await renderOwnerView(client, interaction.guildId, section);
    if (view.error) return interaction.editReply({ content: view.error, ephemeral: true });
    await interaction.editReply(view.panel);
  },
};

/** Rebuild an owner panel. Shared with `adm:refresh` button routing. */
export async function renderOwnerView(client, guildId, section) {
  const runtime = client.runtime;
  try {
    switch (section) {
      case 'health': {
        const memory = await runtime.memory.stats().catch(() => ({ enabled: false, model: 'n/a', dimensions: 0, total: 0, byKind: [] }));
        return { panel: healthPanel({ database: runtime.state.database, redis: runtime.state.redis, memory, models: client.runtime.agent?.router?.snapshot?.() ?? {}, observedAt: new Date().toISOString() }) };
      }
      case 'budget': {
        const router = client.runtime.agent?.router ?? { spent: 0, budgetUsd: 0 };
        const usage = await runtime.db.query('SELECT capability, SUM(cost_usd)::float AS cost FROM model_usage GROUP BY capability ORDER BY cost DESC').catch(() => ({ rows: [] }));
        const reservations = await runtime.db.query('SELECT domain, amount, status, guild_discord_id, created_at FROM budget_reservations ORDER BY created_at DESC LIMIT 10').catch(() => ({ rows: [] }));
        return { panel: budgetPanel({ spent: router.spent ?? 0, limit: router.budgetUsd ?? 0, byCapability: usage.rows.map((r) => [r.capability, r.cost]), reservations: reservations.rows, periodStart: new Date().toISOString().slice(0, 10) }) };
      }
      case 'approvals': {
        const { rows } = await runtime.db.query(`SELECT id, goal, domain, risk, status, created_at FROM proposals WHERE guild_discord_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 10`, [guildId]).catch(() => ({ rows: [] }));
        return { panel: approvalsPanel(rows) };
      }
      case 'policies': {
        const { rows } = await runtime.db.query(`SELECT p.domain, p.level, b.limit_amount AS budget FROM autonomy_policies p LEFT JOIN budgets b ON b.guild_id=p.guild_id AND b.domain=p.domain AND b.resets_at > now() WHERE p.guild_id=(SELECT id FROM guilds WHERE discord_id=$1) ORDER BY p.domain`, [guildId]).catch(() => ({ rows: [] }));
        return { panel: policiesPanel(rows) };
      }
      case 'memory': {
        const stats = await runtime.memory.stats().catch(() => ({ enabled: false, model: 'n/a', dimensions: 0, total: 0, byKind: [] }));
        const recent = await runtime.memory.recent({ guildId, limit: 6 }).catch(() => []);
        return { panel: memoryPanel({ ...stats, recent }) };
      }
      default:
        return { error: 'Unknown console section.' };
    }
  } catch (error) {
    client.logger.error({ err: error, section, correlationId: correlationId() }, 'owner console render failed');
    return { error: `Console render failed: ${error.message}` };
  }
}