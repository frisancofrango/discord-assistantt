import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('storeconfig')
    .setDescription('Configura canais da loja, categoria de carrinhos privados e moeda.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('categoria_carrinhos').setDescription('Categoria onde os canais privados de carrinho serão criados').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
    .addChannelOption(o => o.setName('canal_avaliacoes').setDescription('Canal de logs públicos de compras e feedbacks').addChannelTypes(ChannelType.GuildText).setRequired(false))
    .addStringOption(o =>
      o.setName('moeda')
        .setDescription('Moeda padrão das transações')
        .setRequired(false)
        .addChoices({ name: 'Real Brasileiro (BRL)', value: 'BRL' }, { name: 'Dólar Americano (USD)', value: 'USD' })
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de configuração indisponível.', ephemeral: true });

    const cartCat = interaction.options.getChannel('categoria_carrinhos');
    const revCh = interaction.options.getChannel('canal_avaliacoes');
    const currency = interaction.options.getString('moeda');
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    const updated = await native.cartChannel.setCommerceChannels(interaction.guildId, {
      cartCategoryId: cartCat ? cartCat.id : undefined,
      reviewsChannelId: revCh ? revCh.id : undefined,
      currency: currency || undefined,
    }, ctx);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'CONFIGURAÇÕES DA LOJA ATUALIZADAS',
          body:
            `> **Categoria de Carrinhos:** ${updated.cart_category_id ? `<#${updated.cart_category_id}>` : '*Direto no Servidor*'}\n` +
            `> **Canal de Avaliações:** ${updated.reviews_channel_id ? `<#${updated.reviews_channel_id}>` : '*Desativado*'}\n` +
            `> **Moeda Oficial:** **\`${updated.currency || 'BRL'}\`**`,
        }),
      ],
    });
  },
};
