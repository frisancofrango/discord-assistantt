import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Deleta mensagens recentes em lote no canal.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('quantidade').setDescription('Número de mensagens a apagar (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),

  async execute(interaction) {
    const count = interaction.options.getInteger('quantidade');
    const deleted = await interaction.channel.bulkDelete(count, true);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'LIMPEZA CONCLUÍDA', body: `Apagadas **${deleted.size}** mensagens do canal.` })],
    });
  },
};
