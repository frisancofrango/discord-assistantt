import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('modmail')
    .setDescription('Central de atendimento sigiloso via mensagens diretas (DM).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sc =>
      sc.setName('fechar')
        .setDescription('Encerra o atendimento de modmail atual.')
        .addStringOption(o => o.setName('motivo').setDescription('Motivo do encerramento').setRequired(false))
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Modmail indisponível.', ephemeral: true });

    const reason = interaction.options.getString('motivo') || 'Atendimento finalizado.';
    const thread = await native.modmail.getThreadByThreadId(interaction.channelId);
    if (!thread) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'ERRO', body: 'Este canal não é um tópico ativo de Modmail.' })] });
    }

    await native.modmail.closeThread(thread.id, interaction.user.id, reason, { actorId: interaction.user.id, guildId: interaction.guildId });

    return interaction.reply({
      flags: V2,
      components: [panel({ title: 'ATENDIMENTO ENCERRADO', body: `Tópico de suporte sigiloso finalizado.\nMotivo: ${reason}` })],
    });
  },
};
