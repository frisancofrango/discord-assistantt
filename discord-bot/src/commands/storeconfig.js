import { PermissionFlagsBits, SlashCommandBuilder, ChannelType } from 'discord.js';
import { panel, notice, V2 } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('storeconfig')
    .setDescription('Configure Brazilian Discord Commerce channels, private cart category, and reviews broadcast.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o
        .setName('cart_category')
        .setDescription('Categoria para criação de carrinhos privados (🛒・carrinho-user)')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false)
    )
    .addChannelOption((o) =>
      o
        .setName('reviews_channel')
        .setDescription('Canal público para broadcast de avaliações (⭐・avaliações)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption((o) =>
      o
        .setName('logs_channel')
        .setDescription('Canal privado para logs de vendas e chaves PIX')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addStringOption((o) =>
      o
        .setName('currency')
        .setDescription('Moeda padrão da loja')
        .addChoices({ name: '🇧🇷 Real Brasileiro (BRL)', value: 'BRL' }, { name: '🇺🇸 Dólar Americano (USD)', value: 'USD' })
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const cartSvc = client.runtime?.native?.cartChannel;
    if (!cartSvc) {
      return interaction.reply({ content: 'Cart Channel Service is unavailable.', ephemeral: true });
    }

    const ctx = actorContext(interaction);
    const cartCat = interaction.options.getChannel('cart_category');
    const revCh = interaction.options.getChannel('reviews_channel');
    const logsCh = interaction.options.getChannel('logs_channel');
    const cur = interaction.options.getString('currency') || 'BRL';

    try {
      const saved = await cartSvc.setCommerceChannels(
        interaction.guildId,
        {
          cartCategoryId: cartCat?.id,
          reviewsChannelId: revCh?.id,
          logsChannelId: logsCh?.id,
          currency: cur,
          language: 'pt_BR',
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: '🇧🇷 CONFIGURAÇÕES DA LOJA ATUALIZADAS',
            body:
              `> **Categoria de Carrinhos:** ${saved.cart_category_id ? `<#${saved.cart_category_id}>` : '*Não definida*'}\n` +
              `> **Canal de Avaliações:** ${saved.reviews_channel_id ? `<#${saved.reviews_channel_id}>` : '*Não definido*'}\n` +
              `> **Canal de Logs:** ${saved.logs_channel_id ? `<#${saved.logs_channel_id}>` : '*Não definido*'}\n` +
              `> **Moeda Principal:** **\`${saved.currency}\`**\n` +
              `> **Idioma:** \`${saved.language}\``,
            footer: 'Loop Commerce Suite · Padrão de Excelência',
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERRO', body: err.message })] });
    }
  },
};
