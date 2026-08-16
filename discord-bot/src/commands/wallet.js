import { SlashCommandBuilder } from 'discord.js';
import { walletPanel, notice, V2, formatMoney } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('Access your digital wallet, balance, deposits and transfers.')
    .addSubcommand((s) =>
      s.setName('view').setDescription('View your current wallet balance and recent activity.')
    )
    .addSubcommand((s) =>
      s
        .setName('deposit')
        .setDescription('Simulate or generate a deposit to your wallet.')
        .addNumberOption((o) =>
          o.setName('amount').setDescription('Amount to deposit (e.g. 10.00)').setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('transfer')
        .setDescription('Transfer wallet funds to another server member.')
        .addUserOption((o) =>
          o.setName('recipient').setDescription('The member to send funds to').setRequired(true)
        )
        .addNumberOption((o) =>
          o.setName('amount').setDescription('Amount to transfer').setRequired(true).setMinValue(1)
        )
    ),

  async execute(interaction, client) {
    const walletService = client.runtime?.native?.wallet;
    if (!walletService) {
      return interaction.reply({ content: 'Wallet systems are currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand(false) || 'view';
    const ctx = actorContext(interaction);

    if (sub === 'view') {
      const wallet = await walletService.getWallet(interaction.guildId, interaction.user.id, 'USD');
      const transactions = await walletService.history(interaction.guildId, interaction.user.id, 5);
      const panel = walletPanel({ wallet, transactions, currency: wallet.currency });

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel],
      });
    }

    if (sub === 'deposit') {
      const amt = interaction.options.getNumber('amount', true);
      const amtMinor = Math.round(amt * 100);
      const result = await walletService.deposit(
        {
          guildId: interaction.guildId,
          memberId: interaction.user.id,
          amountMinor: amtMinor,
          currency: 'USD',
          reference: 'manual_deposit',
          idempotencyKey: `deposit:cmd:${interaction.id}`,
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'DEPOSIT SUCCESSFUL',
            body:
              `Successfully credited **${formatMoney(amtMinor, 'USD')}** to your wallet.\n\n` +
              `New Available Balance: **${formatMoney(result.balanceMinor, result.currency)}**`,
            footer: 'Transaction recorded on the server ledger.',
          }),
        ],
      });
    }

    if (sub === 'transfer') {
      const recipient = interaction.options.getUser('recipient', true);
      const amt = interaction.options.getNumber('amount', true);
      const amtMinor = Math.round(amt * 100);

      try {
        const result = await walletService.transfer(
          {
            guildId: interaction.guildId,
            senderId: interaction.user.id,
            recipientId: recipient.id,
            amountMinor: amtMinor,
            currency: 'USD',
            idempotencyKey: `transfer:cmd:${interaction.id}`,
          },
          ctx
        );

        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'TRANSFER COMPLETED',
              body:
                `Sent **${formatMoney(amtMinor, 'USD')}** to <@${recipient.id}>.\n\n` +
                `Your New Balance: **${formatMoney(result.senderBalanceMinor, result.currency)}**`,
              footer: 'Ledger updated atomically.',
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'TRANSFER FAILED',
              body: `Could not complete transfer: ${err.message}`,
            }),
          ],
        });
      }
    }
  },
};
