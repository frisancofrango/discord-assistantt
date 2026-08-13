import { SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('List Azure commands and how to use them.'),
  async execute(interaction, client) {
    const commands = [...client.commands.values()];
    const lines = commands
      .map((c) => `\`/${c.data.name}\` — ${c.data.description}`)
      .sort()
      .join('\n');
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'AZURE · HELP',
          body: lines || 'No commands registered.',
          footer: 'Owner-only commands: /task, /admin, moderation commands.',
        }),
      ],
    });
  },
};