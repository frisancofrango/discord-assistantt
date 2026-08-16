import { SlashCommandBuilder } from 'discord.js';
import { storefrontPanel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sales')
    .setDescription('Display the server digital storefront with live inventory and instant checkout.'),

  async execute(interaction, client) {
    const commerce = client.runtime?.native?.commerce;
    if (!commerce) {
      return interaction.reply({ content: 'Storefront is currently unavailable.', ephemeral: true });
    }

    const products = await commerce.listProducts(interaction.guildId);
    const cart = await commerce.getCart(interaction.guildId, interaction.user.id).catch(() => ({ items: [] }));
    const cartCount = cart.items?.reduce((s, i) => s + i.quantity, 0) || 0;

    const panel = storefrontPanel({
      products,
      cartItemCount: cartCount,
    });

    return interaction.reply({
      flags: V2,
      components: [panel],
    });
  },
};
