import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';
import { guardTarget, fail, logAction } from '../lib/moderation.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member and DM them the reason.')
    .addUserOption((o) =>
      o.setName('user').setDescription('User to warn').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason').setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction, client) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return fail(interaction, 'That user is not in this server.');
    const blocked = guardTarget(interaction, member);
    if (blocked) return fail(interaction, blocked);

    // Best-effort DM to the warned user.
    let dmDelivered = true;
    try {
      await user.send({
        flags: V2,
        components: [
          panel({
            title: 'WARNING',
            body: `You were warned in **${interaction.guild.name}**.\nReason: ${reason}`,
          }),
        ],
      });
    } catch {
      dmDelivered = false;
    }

    await interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'WARNED',
          body: `**${user.tag}** has been warned.\nReason: ${reason}`,
          footer: dmDelivered ? 'User notified via DM.' : 'Could not DM the user.',
        }),
      ],
    });

    await logAction(client, {
      action: 'Warn',
      target: user.tag,
      moderator: interaction.user.tag,
      reason,
    });
  },
};
