import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildProposal } from '../autonomy/proposal.js';
import { proposalPanel } from '../autonomy/ui.js';
import { correlationId } from '../foundation/logger.js';

export default {
  data:new SlashCommandBuilder().setName('task').setDescription('Ask Azure to inspect, plan, and propose a server task.').addStringOption(o=>o.setName('goal').setDescription('What should Azure accomplish?').setRequired(true).setMaxLength(1000)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction,client){if(!interaction.inGuild()||interaction.guild.ownerId!==interaction.user.id)return interaction.reply({content:'Only the server owner can create autonomy proposals.',ephemeral:true});await interaction.deferReply({ephemeral:true});const goal=interaction.options.getString('goal',true),runtime=client.runtime,db=runtime.db;
    const guild=(await db.query(`INSERT INTO guilds(discord_id,name) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET name=excluded.name RETURNING *`,[interaction.guildId,interaction.guild.name])).rows[0];const user=(await db.query(`INSERT INTO users(discord_id,username) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username RETURNING *`,[interaction.user.id,interaction.user.username])).rows[0];
    const snapshotReceipt=await client.discordRuntime.tools.invoke('guild.snapshot',{guildId:interaction.guildId},{client,db,idempotencyKey:`task:${interaction.id}:snapshot`,autonomy:'advisor',actor:{authenticated:true,guildMember:true,isOwner:true,permissions:[]},correlationId:correlationId()});const before=snapshotReceipt.output.snapshot;const {task,plan}=await runtime.agent.planner.create({goal,context:{observedAt:before.capturedAt,guildSnapshot:before},guildId:guild.id,actorId:user.id,idempotencyKey:`task:${interaction.id}`});
    const draft=buildProposal({task,plan,beforeSnapshot:before,tierCount:client.runtime.autonomy.config.tierCount});draft.beforeSnapshot=before;const row=await runtime.autonomy.store.createProposal(draft);const proposal=runtime.autonomy.hydrate(row);proposal.beforeSnapshot=before;const grant=await runtime.autonomy.approvals.issue({proposal,actorId:interaction.user.id});await interaction.editReply(proposalPanel(proposal,grant.token));
  }
};
