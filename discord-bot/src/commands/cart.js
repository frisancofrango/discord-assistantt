import { SlashCommandBuilder } from 'discord.js';
import { cartPanel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('cart')
    .setDescription('View and manage your active shopping cart.'),

  async execute(interaction, client) {
    const commerce = client.runtime?.native?.commerce;
    if (!commerce) {
      return interaction.reply({ content: 'Commerce systems are currently unavailable.', ephemeral: true });
    }

    const cart = await commerce.getCart(interaction.guildId, interaction.user.id);
    const panel = cartPanel({
      cart,
      items: cart.items,
      subtotalMinor: cart.subtotalMinor,
      currency: cart.currency,
      expiresAt: cart.expiresAt,
    });

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel],
    });
  },
};
