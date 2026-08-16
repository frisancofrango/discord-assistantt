import { SlashCommandBuilder } from 'discord.js';
import { helpMenuPanel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List Azure commands and how to use them.'),

  async execute(interaction) {
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [helpMenuPanel()],
    });
  },
};