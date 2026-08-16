import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Fixa mensagens automaticamente no rodapé do chat.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sc =>
      sc.setName('definir')
        .setDescription('Define uma mensagem fixa flutuante para este canal.')
        .addStringOption(o => o.setName('mensagem').setDescription('Conteúdo da mensagem fixa').setRequired(true))
    )
    .addSubcommand(sc => sc.setName('remover').setDescription('Remove a mensagem fixa deste canal.')),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de sticky indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'definir') {
      const msg = interaction.options.getString('mensagem');
      await native.sticky.setSticky(interaction.guildId, interaction.channelId, msg, ctx);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'MENSAGEM FIXADA', body: 'Mensagem persistente configurada para este canal com sucesso.' })],
      });
    }

    await native.sticky.clearSticky(interaction.channelId);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'STICKY REMOVIDO', body: 'Mensagem fixa removida deste canal.' })],
    });
  },
};
