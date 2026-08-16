import { SlashCommandBuilder } from 'discord.js';
import { storefrontPanel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sales')
    .setDescription('Exibe a vitrine comercial oficial com catálogo e compra rápida.'),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de vendas indisponível.', ephemeral: true });

    const products = await native.commerce.listProducts(interaction.guildId);
    const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id).catch(() => ({ items: [] }));
    const count = cart.items?.reduce((s, i) => s + i.quantity, 0) || 0;

    return interaction.reply({
      flags: V2,
      components: [storefrontPanel({ products, cartItemCount: count, currency: 'BRL' })],
    });
  },
};
