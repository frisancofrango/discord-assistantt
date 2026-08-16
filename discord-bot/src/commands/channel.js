import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Controle de horários de expediente e trancas de canais.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sc => sc.setName('status').setDescription('Exibe o horário de funcionamento atual do servidor.'))
    .addSubcommand(sc =>
      sc.setName('horario')
        .setDescription('Define o horário de atendimento.')
        .addStringOption(o => o.setName('inicio').setDescription('Horário de abertura (ex: 09:00)').setRequired(true))
        .addStringOption(o => o.setName('fim').setDescription('Horário de encerramento (ex: 22:00)').setRequired(true))
        .addStringOption(o => o.setName('mensagem').setDescription('Mensagem de ausência').setRequired(false))
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema operacional indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'horario') {
      const start = interaction.options.getString('inicio');
      const end = interaction.options.getString('fim');
      const msg = interaction.options.getString('mensagem') || 'Estamos fora do expediente.';

      const res = await native.schedule.setOperatingHours(interaction.guildId, { enabled: true, startTime: start, endTime: end, outOfOfficeMessage: msg }, ctx);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'HORÁRIO ATUALIZADO', body: `Expediente definido: **${res.startTime} às ${res.endTime}**.` })],
      });
    }

    const hours = await native.schedule.getOperatingHours(interaction.guildId);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'EXPEDIENTE DO SERVIDOR',
          body: `> **Status:** ${hours.isOpen ? '🟢 **ABERTO**' : '🔴 **FECHADO**'}\n> **Horário:** **${hours.startTime} às ${hours.endTime}**`,
        }),
      ],
    });
  },
};
