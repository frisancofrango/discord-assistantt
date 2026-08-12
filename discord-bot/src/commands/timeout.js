import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';
import { guardTarget, fail, logAction } from '../lib/moderation.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member for a number of minutes.')
    .addUserOption((o) =>
      o.setName('user').setDescription('User to timeout').setRequired(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('minutes')
        .setDescription('Duration in minutes (0 to remove timeout)')
        .setMinValue(0)
        .setMaxValue(40320) // 28 days, Discord max
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason').setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction, client) {
    const user = interaction.options.getUser('user', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return fail(interaction, 'That user is not in this server.');
    const blocked = guardTarget(interaction, member);
    if (blocked) return fail(interaction, blocked);

    try {
      await member.timeout(minutes === 0 ? null : minutes * 60 * 1000, reason);
    } catch (err) {
      console.error('[timeout]', err);
      return fail(interaction, 'I could not apply that timeout. Check my permissions.');
    }

    const label = minutes === 0 ? 'Timeout removed' : `Timed out for ${minutes} min`;
    await interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'DONE', body: `${label} ${user.tag}.` })],
    });

    await logAction(client, {
      action: minutes === 0 ? 'Timeout removed' : `Timeout (${minutes}m)`,
      target: user.tag,
      moderator: interaction.user.tag,
      reason,
    });
  },
};
