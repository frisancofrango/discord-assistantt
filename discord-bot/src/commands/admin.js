import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { healthPanel, budgetPanel, approvalsPanel, policiesPanel, memoryPanel, KINDS } from '../ui/owner.js';

const SECTIONS = new Set(Object.keys(KINDS));

/**
 * Render owner view for admin console.
 */
export async function renderOwnerView(client, guildId, section = 'health') {
  const store = client.runtime.state.database ? client.runtime.autonomy?.store : null;
  switch (section) {
    case 'health': {
      const memTotal = client.runtime.memory ? (await client.runtime.memory.stats({ guildId })).total : 0;
      const data = {
        database: Boolean(client.runtime.state.database),
        redis: Boolean(client.runtime.state.redis),
        memory: {
          enabled: Boolean(client.runtime.memory?.enabled),
          model: client.runtime.config.embedModel,
          dimensions: client.runtime.config.embedDimensions,
          total: memTotal,
        },
        models: client.runtime.agent.router?.health() ?? {},
        observedAt: new Date().toISOString().slice(11, 19) + 'Z',
      };
      return { panel: healthPanel(data) };
    }
    case 'budget': {
      const budget = client.runtime.agent.router?.budget ?? { spent: 0, limit: 5, reservations: [] };
      const usage = client.runtime.repositories.agentUsage ? await client.runtime.repositories.agentUsage.today({ guildId }) : { totalUsd: 0, byCapability: [] };
      return {
        panel: budgetPanel({
          spent: usage.totalUsd,
          limit: budget.limit,
          byCapability: usage.byCapability,
          reservations: budget.reservations ?? [],
          periodStart: new Date().toISOString().slice(0, 10),
        }),
      };
    }
    case 'approvals': {
      const rows = store ? await store.listPendingApprovals(guildId) : [];
      return { panel: approvalsPanel(rows) };
    }
    case 'policies': {
      const rows = store ? await store.listPolicies(guildId) : [];
      return { panel: policiesPanel(rows) };
    }
    case 'memory': {
      if (!client.runtime.memory) {
        return { panel: memoryPanel({ enabled: false, model: 'n/a', dimensions: 0, total: 0, byKind: [], recent: [] }) };
      }
      const stats = await client.runtime.memory.stats({ guildId });
      const recent = await client.runtime.memory.recent({ guildId, limit: 5 });
      return {
        panel: memoryPanel({
          enabled: client.runtime.memory.enabled,
          model: client.runtime.config.embedModel,
          dimensions: client.runtime.config.embedDimensions,
          total: stats.total,
          byKind: stats.byKind,
          recent,
        }),
      };
    }
    default:
      return { error: `Unknown section: ${section}` };
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Console administrativo do dono: saúde, orçamento, aprovações, políticas e memória.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('health').setDescription('Diagnóstico de integridade, modelos de IA e banco de dados.'))
    .addSubcommand((s) => s.setName('budget').setDescription('Consumo e orçamento de autonomia do agente.'))
    .addSubcommand((s) => s.setName('approvals').setDescription('Propostas de tarefas autônomas pendentes de aprovação.'))
    .addSubcommand((s) => s.setName('policies').setDescription('Políticas de autonomia e limites de operação.'))
    .addSubcommand((s) => s.setName('memory').setDescription('Memória semântica RAG e vetores gravados.')),

  async execute(interaction, client) {
    if (!interaction.inGuild() || interaction.guild.ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'Apenas o dono do servidor pode abrir o console administrativo.', ephemeral: true });
    }
    const section = interaction.options.getSubcommand(true);
    await interaction.deferReply({ ephemeral: true });
    const view = await renderOwnerView(client, interaction.guildId, section);
    if (view.error) return interaction.editReply({ content: view.error });
    return interaction.editReply(view.panel);
  },
};
