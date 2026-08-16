import { SlashCommandBuilder } from 'discord.js';
import { cartPanel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('cart')
    .setDescription('Visualiza e gerencia seu carrinho de compras ativo.'),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de comércio indisponível.', ephemeral: true });

    const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [cartPanel({ cart, items: cart.items, subtotalMinor: cart.subtotalMinor, currency: 'BRL' })],
    });
  },
};
