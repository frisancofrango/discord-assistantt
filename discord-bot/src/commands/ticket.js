import { SlashCommandBuilder } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Central de atendimento e abertura de tickets de suporte.')
    .addSubcommand(sc =>
      sc.setName('abrir')
        .setDescription('Abre um novo ticket de suporte privado.')
        .addStringOption(o => o.setName('assunto').setDescription('Assunto ou motivo do suporte').setRequired(true))
    )
    .addSubcommand(sc => sc.setName('fechar').setDescription('Fecha o ticket de suporte atual.')),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Central de suporte indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'abrir') {
      const subject = interaction.options.getString('assunto');
      const ticket = await native.tickets.create({
        idempotencyKey: `ticket:${interaction.id}`,
        memberId: interaction.user.id,
        categoryKey: 'general',
        subject,
      }, ctx);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: `TICKET #${ticket.sequence} CRIADO`,
            body: `Seu chamado foi aberto com sucesso: **${subject}**.\nNossa equipe responderá em instantes.`,
          }),
        ],
      });
    }

    return interaction.reply({
      flags: V2,
      components: [
        panel({
          title: 'FECHAR ATENDIMENTO',
          body: 'Deseja encerrar este ticket de suporte?',
          buttons: [button.danger(`ticket:close:${interaction.channelId}`, 'Confirmar Encerramento')],
        }),
      ],
    });
  },
};
