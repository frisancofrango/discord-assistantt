import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Publica um anúncio oficial com design limpo e moderno.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(o => o.setName('canal').setDescription('Canal de destino').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
    .addStringOption(o => o.setName('titulo').setDescription('Título do comunicado').setRequired(true).setMaxLength(256))
    .addStringOption(o => o.setName('mensagem').setDescription('Conteúdo do anúncio').setRequired(true).setMaxLength(4000)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('canal');
    const title = interaction.options.getString('titulo');
    const message = interaction.options.getString('mensagem');

    await channel.send({
      flags: V2,
      components: [panel({ title: title.toUpperCase(), body: message, footer: `Comunicado Oficial · ${interaction.guild.name}` })],
    });

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'ANÚNCIO PUBLICADO', body: `Comunicado enviado com sucesso para <#${channel.id}>.` })],
    });
  },
};
