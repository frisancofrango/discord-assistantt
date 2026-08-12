import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';
import { guardTarget, fail } from '../lib/moderation.js';
import { stash } from '../lib/pending.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member (with confirmation).')
    .addUserOption((o) =>
      o.setName('user').setDescription('User to ban').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason').setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const blocked = guardTarget(interaction, member);
    if (blocked) return fail(interaction, blocked);

    const token = stash({
      type: 'ban',
      userId: user.id,
      tag: user.tag,
      reason,
      moderatorId: interaction.user.id,
    });

    await interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'CONFIRM BAN',
          body: `You are about to **ban ${user.tag}**.\nReason: ${reason}`,
          footer: 'This action is permanent.',
          buttons: [
            button.danger(`modconfirm:${token}`, 'Confirm Ban'),
            button.neutral(`modcancel:${token}`, 'Cancel'),
          ],
        }),
      ],
    });
  },
};
