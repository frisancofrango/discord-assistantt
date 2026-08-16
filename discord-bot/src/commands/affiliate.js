import { SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button, formatMoney } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('affiliate')
    .setDescription('Affiliate referral program and commission earnings.')
    .addSubcommand((s) =>
      s
        .setName('link')
        .setDescription('Get your personal referral code to share with friends.')
        .addStringOption((o) =>
          o.setName('custom_code').setDescription('Optional custom referral code').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s.setName('stats').setDescription('View your referral earnings and commission history.')
    ),

  async execute(interaction, client) {
    const affiliate = client.runtime?.native?.affiliate;
    if (!affiliate) {
      return interaction.reply({ content: 'Affiliate system is currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'link') {
      const custom = interaction.options.getString('custom_code');
      const ref = await affiliate.getOrCreateReferralCode(interaction.guildId, interaction.user.id, custom);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'AFFILIATE REFERRAL PROGRAM',
            subtitle: `Commission Rate: ${ref.commissionPercent}% on every sale`,
            body:
              `Share your unique referral code with friends to earn real funds directly to your **Digital Wallet** on every purchase!\n\n` +
              `> Your Code: **\`${ref.code}\`**\n` +
              `> Total Earned: **${formatMoney(ref.totalEarningsMinor, 'USD')}**\n` +
              `> Successful Referrals: **${ref.totalReferrals}**\n\n` +
              `*Friends can enter this code in checkout or store purchases.*`,
            buttons: [
              button.primary('wallet:view', '💳 View Wallet Balance'),
              button.neutral('store:view', '🛍️ Browse Store'),
            ],
            footer: 'Automated 1-click commission payout into your digital wallet.',
          }),
        ],
      });
    }

    if (sub === 'stats') {
      const ref = await affiliate.getOrCreateReferralCode(interaction.guildId, interaction.user.id);
      const history = await affiliate.listUserReferrals(interaction.guildId, interaction.user.id);

      const historyLines = history.slice(0, 5).map((h) => {
        const time = `<t:${Math.floor(new Date(h.createdAt).getTime() / 1000)}:R>`;
        return `> **+${formatMoney(h.commissionAmountMinor, h.currency)}** from <@${h.buyerId}> · ${time}`;
      }).join('\n') || 'No commissions earned yet. Share your code to get started!';

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'AFFILIATE EARNINGS & COMMISSIONS',
            subtitle: `Referral Code: \`${ref.code}\``,
            body:
              `> **Total Earnings:** **${formatMoney(ref.totalEarningsMinor, 'USD')}**\n` +
              `> **Referred Customers:** **${ref.totalReferrals}**\n\n` +
              `### Recent Referral Payouts\n${historyLines}`,
            buttons: [button.primary('wallet:view', '💳 Open Wallet')],
          }),
        ],
      });
    }
  },
};
