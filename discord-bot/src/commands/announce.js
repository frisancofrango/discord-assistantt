import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a clean monochrome announcement panel.')
    .addStringOption((o) =>
      o.setName('title').setDescription('Headline').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('message').setDescription('Body text').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('footer').setDescription('Small footer line').setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const title = interaction.options.getString('title', true);
    const message = interaction.options.getString('message', true);
    const footer = interaction.options.getString('footer') ?? undefined;

    await interaction.reply({
      flags: V2,
      components: [panel({ title: title.toUpperCase(), body: message, footer })],
    });
  },
};
