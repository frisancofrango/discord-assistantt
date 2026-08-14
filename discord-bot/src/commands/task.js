import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildProposal } from '../autonomy/proposal.js';
import { progressPanel, receiptPanel } from '../autonomy/ui.js';
import { correlationId } from '../foundation/logger.js';

export default {
  data: new SlashCommandBuilder().setName('task').setDescription('Ask Azure to inspect and execute a server task (runs autonomously).').addStringOption(o => o.setName('goal').setDescription('What should Azure accomplish?').setRequired(true).setMaxLength(1000)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction, client) {
    if (!interaction.inGuild() || interaction.guild.ownerId !== interaction.user.id) return interaction.reply({ content: 'Only the server owner can run /task.', ephemeral: true });
    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
    const goal = interaction.options.getString('goal', true);
    const runtime = client.runtime, db = runtime.db;
    try {
      const guild = (await db.query(`INSERT INTO guilds(discord_id,name) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET name=excluded.name RETURNING *`, [interaction.guildId, interaction.guild.name])).rows[0];
      const user = (await db.query(`INSERT INTO users(discord_id,username) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username RETURNING *`, [interaction.user.id, interaction.user.username])).rows[0];
      await interaction.editReply({ content: `on it. inspecting the server first...` });
      const snapshotReceipt = await client.discordRuntime.tools.invoke('guild.snapshot', { guildId: interaction.guildId }, { client, db, idempotencyKey: `task:${interaction.id}:snapshot`, autonomy: 'advisor', actor: { authenticated: true, guildMember: true, isOwner: true, permissions: [] }, correlationId: correlationId() });
      const before = snapshotReceipt.output.snapshot;
      await interaction.editReply({ content: `planning: **${goal}**` });
      const { task, plan } = await runtime.agent.planner.create({ goal, context: { observedAt: before.capturedAt, guildSnapshot: before }, guildId: guild.id, actorId: user.id, idempotencyKey: `task:${interaction.id}` });
      const draft = buildProposal({ task, plan, beforeSnapshot: before, tierCount: runtime.autonomy.config.tierCount });
      draft.beforeSnapshot = before;
      const row = await runtime.autonomy.store.createProposal(draft);
      const proposal = runtime.autonomy.hydrate(row);
      proposal.beforeSnapshot = before;
      const grant = await runtime.autonomy.approvals.issue({ proposal, actorId: interaction.user.id });
      const actor = { id: interaction.user.id, guildId: interaction.guildId, authenticated: true, bot: false, isOwner: true, permissions: [] };
      const safe = proposal.machinePlan.steps.filter((s) => !s.irreversible && s.risk !== 'high').map((s) => s.id);
      const decision = await runtime.autonomy.approvals.decide({ token: grant.token, proposal, actor, decision: 'approve_all', selectedStepIds: safe, policy: { default: { autonomy: 'operator' } }, budget: { limit: runtime.agent.router?.budgetUsd ?? 5, spent: 0 } });
      await interaction.editReply({ ...progressPanel({ goal: proposal.goal, status: 'running', stage: 'preflight', completed: 0, total: decision.approvedStepIds?.length ?? decision.approved_step_ids?.length ?? 0 }) });
      const result = await runtime.autonomy.executor.start({ proposal, decision, actor });
      const titles = proposal.machinePlan.steps.slice(0, 3).map((s) => s.title).join(' \u00b7 ');
      await interaction.editReply({ ...receiptPanel(result.receipt), content: `done: ${titles}${proposal.machinePlan.steps.length > 3 ? ` +${proposal.machinePlan.steps.length - 3} more` : ''}` }).catch(() => {});
    } catch (err) {
      client.logger?.error?.({ err, goal }, 'slash task failed');
      await interaction.editReply({ content: `task failed: ${String(err?.message ?? err).slice(0, 800)}` }).catch(() => {});
    }
  }
};