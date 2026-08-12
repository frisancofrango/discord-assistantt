import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';
import { fail, logAction } from '../lib/moderation.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk-delete recent messages in this channel.')
    .addIntegerOption((o) =>
      o
        .setName('count')
        .setDescription('How many messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .addUserOption((o) =>
      o.setName('user').setDescription('Only delete messages from this user').setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction, client) {
    const count = interaction.options.getInteger('count', true);
    const user = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    // Discord can only bulk-delete messages younger than 14 days.
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    messages = messages.filter((m) => m.createdTimestamp > cutoff);
    if (user) messages = messages.filter((m) => m.author.id === user.id);

    const toDelete = [...messages.values()].slice(0, count);
    if (toDelete.length === 0) {
      return fail(interaction, 'No deletable messages found (they may be older than 14 days).');
    }

    let deleted;
    try {
      deleted = await interaction.channel.bulkDelete(toDelete, true);
    } catch (err) {
      console.error('[purge]', err);
      return fail(interaction, 'I could not delete those messages. Check my permissions.');
    }

    await interaction.editReply({
      flags: V2,
      components: [
        panel({
          title: 'PURGED',
          body: `Deleted **${deleted.size}** message(s)${user ? ` from ${user.tag}` : ''}.`,
        }),
      ],
    });

    await logAction(client, {
      action: 'Purge',
      target: `#${interaction.channel.name}`,
      moderator: interaction.user.tag,
      reason: `${deleted.size} messages${user ? ` from ${user.tag}` : ''}`,
    });
  },
};
