import { SlashCommandBuilder } from 'discord.js';
import { walletPanel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('Acesse sua carteira digital, saldo, depósitos PIX e transferências.'),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Carteira digital indisponível.', ephemeral: true });

    const wallet = await native.wallet.getWallet(interaction.guildId, interaction.user.id, 'BRL');
    const transactions = await native.wallet.history(interaction.guildId, interaction.user.id, 5);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [walletPanel({ wallet, transactions, currency: 'BRL' })],
    });
  },
};
