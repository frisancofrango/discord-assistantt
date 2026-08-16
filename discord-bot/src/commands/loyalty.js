import { SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button, formatMoney, renderAsciiBar } from '../ui/theme.js';
import { DEFAULT_LOYALTY_TIERS } from '../native/loyalty.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loyalty')
    .setDescription('Buyer loyalty VIP tiers, wallet cashback, and top customer leaderboard.')
    .addSubcommand((s) =>
      s.setName('status').setDescription('Check your current VIP tier, cashback rate, and rewards.')
    )
    .addSubcommand((s) =>
      s.setName('leaderboard').setDescription('View the server top customer leaderboard.')
    )
    .addSubcommand((s) =>
      s.setName('tiers').setDescription('Browse all VIP tier perks and cashback rates.')
    ),

  async execute(interaction, client) {
    const loyalty = client.runtime?.native?.loyalty;
    if (!loyalty) {
      return interaction.reply({ content: 'Loyalty system is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'status') {
      const status = await loyalty.getMemberLoyalty(interaction.guildId, interaction.user.id);
      const spentStr = formatMoney(status.lifetimeSpentMinor, 'USD');
      const cashbackStr = formatMoney(status.totalCashbackMinor, 'USD');

      const nextTargetMinor = status.lifetimeSpentMinor + status.remainingForNextTierMinor;
      const progressPercent = nextTargetMinor > 0 ? Math.min(100, Math.round((status.lifetimeSpentMinor / nextTargetMinor) * 100)) : 100;
      const progressBar = renderAsciiBar(progressPercent, 100, 10);

      const nextTierNote = status.nextTier !== 'MAX TIER'
        ? `\n> **Next Tier:** **${status.nextTier}** (${formatMoney(status.remainingForNextTierMinor, 'USD')} to go)\n> **Progress:** ${progressBar}`
        : '\n> **Status:** 👑 **MAX TIER REACHED**';

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'BUYER LOYALTY & REWARDS',
            subtitle: `Current Tier: 🏆 ${status.currentTier} (${status.cashbackPercent}% Wallet Cashback)`,
            body:
              `> **Lifetime Spent:** **${spentStr}**\n` +
              `> **Total Cashback Received:** **${cashbackStr}**\n` +
              `> **Instant Cashback:** ${status.cashbackPercent}% deposited to wallet on every purchase${nextTierNote}`,
            buttons: [
              button.primary('store:view', '🛍️ Browse Store'),
              button.neutral('wallet:view', '💳 View Wallet'),
            ],
            footer: 'Cashback is credited automatically upon payment fulfillment.',
          }),
        ],
      });
    }

    if (sub === 'leaderboard') {
      const board = await loyalty.getLeaderboard(interaction.guildId, 10);
      if (!board.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'LEADERBOARD', body: 'No buyer records found yet. Be the first to shop!' })],
        });
      }

      const lines = board.map((b) => {
        const medal = b.rank === 1 ? '🥇' : b.rank === 2 ? '🥈' : b.rank === 3 ? '🥉' : `**#${b.rank}**`;
        return `> ${medal} <@${b.userId}> — **${formatMoney(b.lifetimeSpentMinor, 'USD')}** (\`${b.currentTier}\`)`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'TOP BUYER LEADERBOARD',
            subtitle: 'VIP Customer Hall of Fame',
            body: lines,
            buttons: [button.primary('store:view', '🛍️ Shop Now')],
          }),
        ],
      });
    }

    if (sub === 'tiers') {
      const tierLines = DEFAULT_LOYALTY_TIERS.map((t) => {
        const icon = t.tierName === 'Obsidian' ? '👑' : t.tierName === 'Diamond' ? '💎' : t.tierName === 'Gold' ? '🥇' : t.tierName === 'Silver' ? '🥈' : '🥉';
        return `> ${icon} **${t.tierName}** — Spent: **${formatMoney(t.minSpendMinor, 'USD')}+** (${t.cashbackPercent}% Cashback)`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'VIP CASHBACK TIERS',
            subtitle: 'Earn higher cashback on every order',
            body: tierLines,
            footer: 'Tier upgrades are unlocked automatically based on lifetime spend.',
          }),
        ],
      });
    }
  },
};
