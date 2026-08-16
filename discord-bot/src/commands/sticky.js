import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2 } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Persistent sticky channel messages pinned to the bottom of chat.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Create or update a sticky message for a channel.')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Target channel').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('title').setDescription('Sticky headline / title').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('message').setDescription('Sticky content body').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('clear')
        .setDescription('Remove the sticky message from a channel.')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Target channel').setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const sticky = client.runtime?.native?.sticky;
    if (!sticky) {
      return interaction.reply({ content: 'Sticky service is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      const title = interaction.options.getString('title', true);
      const content = interaction.options.getString('message', true);

      try {
        await sticky.setSticky(interaction.guildId, channel.id, title, content, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'STICKY MESSAGE ACTIVE',
              body: `Pinned sticky notice to <#${channel.id}>:\n\n**${title}**\n${content}`,
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
      }
    }

    if (sub === 'clear') {
      const channel = interaction.options.getChannel('channel', true);
      try {
        const cleared = await sticky.clearSticky(channel.id, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: cleared ? 'STICKY CLEARED' : 'NO STICKY FOUND',
              body: cleared
                ? `Removed sticky message from <#${channel.id}>.`
                : `No active sticky message was found in <#${channel.id}>.`,
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
      }
    }
  },
};
