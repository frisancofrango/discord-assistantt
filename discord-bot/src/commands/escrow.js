import { SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button, formatMoney } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('escrow')
    .setDescription('Peer-to-peer secure escrow vault and trading desk.')
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Create a secure escrow trade deal with another member.')
        .addUserOption((o) =>
          o.setName('seller').setDescription('The seller/counterparty you are trading with').setRequired(true)
        )
        .addNumberOption((o) =>
          o.setName('amount').setDescription('Escrow amount in USD (e.g. 25.00)').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('terms').setDescription('Specific trade terms and delivery agreement').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Check the live status of an escrow trade deal.')
        .addStringOption((o) =>
          o.setName('deal_id').setDescription('Escrow Deal ID (e.g. esc_...)').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('View your active and completed escrow deals.')
    ),

  async execute(interaction, client) {
    const escrow = client.runtime?.native?.escrow;
    if (!escrow) {
      return interaction.reply({ content: 'Escrow system is currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'create') {
      const seller = interaction.options.getUser('seller', true);
      const amount = interaction.options.getNumber('amount', true);
      const terms = interaction.options.getString('terms', true);

      if (seller.id === interaction.user.id) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'INVALID COUNTERPARTY', body: 'You cannot initiate an escrow trade with yourself.' })],
        });
      }

      const amountMinor = Math.round(amount * 100);
      try {
        const deal = await escrow.createDeal(
          {
            guildId: interaction.guildId,
            buyerId: interaction.user.id,
            sellerId: seller.id,
            amountMinor,
            currency: 'USD',
            terms,
          },
          ctx
        );

        return interaction.reply({
          flags: V2,
          components: [
            panel({
              title: '🤝 SECURE ESCROW TRADE INITIATED',
              subtitle: `Deal \`${deal.id}\` — Status: PENDING DEPOSIT`,
              body:
                `> **Buyer:** <@${deal.buyerId}>\n` +
                `> **Seller:** <@${deal.sellerId}>\n` +
                `> **Trade Amount:** **${formatMoney(deal.amountMinor, 'USD')}**\n` +
                `> **Agreed Terms:**\n> *"${deal.terms}"*\n\n` +
                `The buyer must click **Fund Escrow** below to lock funds securely in the bot vault.`,
              buttons: [
                button.primary(`escrow:fund:${deal.id}`, '💳 Fund Escrow Vault'),
                button.danger(`escrow:cancel:${deal.id}`, 'Cancel Deal'),
              ],
              footer: 'Funds are protected in vault until buyer releases or dispute is resolved.',
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ESCROW ERROR', body: err.message })] });
      }
    }

    if (sub === 'status') {
      const dealId = interaction.options.getString('deal_id', true);
      const deal = await escrow.getDeal(dealId);
      if (!deal) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'NOT FOUND', body: `Deal \`${dealId}\` was not found.` })] });
      }

      const isBuyer = interaction.user.id === deal.buyerId;
      const isSeller = interaction.user.id === deal.sellerId;

      const buttons = [];
      if (deal.status === 'pending_deposit' && isBuyer) {
        buttons.push(button.primary(`escrow:fund:${deal.id}`, '💳 Fund Escrow'));
      } else if (deal.status === 'funds_locked') {
        if (isSeller) buttons.push(button.primary(`escrow:deliver:${deal.id}`, '📦 Mark Goods Delivered'));
        if (isBuyer) buttons.push(button.primary(`escrow:release:${deal.id}`, '✅ Release Funds to Seller'));
        buttons.push(button.danger(`escrow:dispute:${deal.id}`, '⚠️ Open Dispute'));
      } else if (deal.status === 'delivered') {
        if (isBuyer) buttons.push(button.primary(`escrow:release:${deal.id}`, '✅ Release Funds to Seller'));
        buttons.push(button.danger(`escrow:dispute:${deal.id}`, '⚠️ Open Dispute'));
      }

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'ESCROW DEAL STATUS',
            subtitle: `Deal \`${deal.id}\` — **${deal.status.toUpperCase()}**`,
            body:
              `> **Buyer:** <@${deal.buyerId}>\n` +
              `> **Seller:** <@${deal.sellerId}>\n` +
              `> **Amount:** **${formatMoney(deal.amountMinor, deal.currency)}**\n` +
              `> **Terms:**\n> *"${deal.terms}"*`,
            buttons: buttons.length ? buttons : undefined,
          }),
        ],
      });
    }

    if (sub === 'list') {
      const deals = await escrow.listUserDeals(interaction.guildId, interaction.user.id);
      if (!deals.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'MY ESCROW TRADES', body: 'No escrow deals found on your account.' })],
        });
      }

      const lines = deals.map((d) => {
        const role = d.buyerId === interaction.user.id ? 'BUYER' : 'SELLER';
        const partner = d.buyerId === interaction.user.id ? d.sellerId : d.buyerId;
        return `> **\`${d.id}\`** [${role}] with <@${partner}> — **${d.status.toUpperCase()}** (${formatMoney(d.amountMinor, d.currency)})`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'MY ESCROW DEALS', body: lines })],
      });
    }
  },
};
