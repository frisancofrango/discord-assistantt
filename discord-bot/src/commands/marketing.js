import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button, formatMoney } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('marketing')
    .setDescription('Marketing drip campaigns, flash product drops, and customer reviews.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('drop')
        .setDescription('Create a time-limited Flash Product Drop with countdown.')
        .addStringOption((o) =>
          o.setName('title').setDescription('Drop headline (e.g. Midnight Flash Sale)').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('variant_id').setDescription('Product Variant ID').setRequired(true)
        )
        .addNumberOption((o) =>
          o.setName('price').setDescription('Flash sale price in USD (e.g. 4.99)').setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName('hours').setDescription('Duration in hours (e.g. 2)').setRequired(false)
        )
        .addIntegerOption((o) =>
          o.setName('stock').setDescription('Limited stock quantity (optional)').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s.setName('drops_list').setDescription('List active flash product drops and live countdowns.')
    )
    .addSubcommand((s) =>
      s.setName('reviews').setDescription('View customer 5-star reviews and feedback.')
    ),

  async execute(interaction, client) {
    const marketing = client.runtime?.native?.marketing;
    if (!marketing) {
      return interaction.reply({ content: 'Marketing system is currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'drop') {
      const title = interaction.options.getString('title', true);
      const variantId = interaction.options.getString('variant_id', true);
      const price = interaction.options.getNumber('price', true);
      const hours = interaction.options.getInteger('hours') || 2;
      const stock = interaction.options.getInteger('stock');

      const priceMinor = Math.round(price * 100);
      try {
        const drop = await marketing.createFlashDrop(
          {
            guildId: interaction.guildId,
            title,
            variantId,
            dropPriceMinor: priceMinor,
            maxStock: stock,
            durationHours: hours,
          },
          ctx
        );

        const expiryStr = `<t:${Math.floor(new Date(drop.expiresAt).getTime() / 1000)}:R>`;

        return interaction.reply({
          flags: V2,
          components: [
            panel({
              title: `⚡ FLASH DROP: ${drop.title.toUpperCase()}`,
              subtitle: `Limited Time Offer — Price: ${formatMoney(drop.dropPriceMinor, 'USD')}`,
              body:
                `A new flash deal is live now!\n\n` +
                `> **Flash Price:** **${formatMoney(drop.dropPriceMinor, 'USD')}**\n` +
                `> **Ends In:** ${expiryStr}\n` +
                `> **Stock:** ${drop.maxStock ? `Limited to **${drop.maxStock}** units` : '**Unlimited**'}`,
              buttons: [
                button.primary(`buy:${drop.variantId}`, '⚡ Claim Flash Deal'),
                button.neutral('store:view', '🛍️ Browse Catalog'),
              ],
              footer: 'Countdown updates in real-time across Discord clients.',
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
      }
    }

    if (sub === 'drops_list') {
      const drops = await marketing.listFlashDrops(interaction.guildId);
      if (!drops.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'FLASH DROPS', body: 'No active flash sales right now.' })],
        });
      }

      const lines = drops.map((d) => {
        const time = `<t:${Math.floor(new Date(d.expiresAt).getTime() / 1000)}:R>`;
        return `> **${d.title}** — **${formatMoney(d.dropPriceMinor, 'USD')}** (Ends: ${time})`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'ACTIVE FLASH DROPS',
            subtitle: `${drops.length} live drop(s)`,
            body: lines,
            buttons: [button.primary('store:view', '🛍️ Go to Store')],
          }),
        ],
      });
    }

    if (sub === 'reviews') {
      const list = await marketing.listReviews(interaction.guildId, 10);
      if (!list.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'CUSTOMER REVIEWS', body: 'No reviews recorded yet.' })],
        });
      }

      const lines = list.map((r) => {
        const stars = '⭐'.repeat(r.rating);
        const comment = r.comment ? `\n> *"${r.comment}"*` : '';
        return `> <@${r.memberId}> — ${stars}${comment}`;
      }).join('\n\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'VERIFIED CUSTOMER REVIEWS',
            subtitle: `${list.length} recent review(s)`,
            body: lines,
          }),
        ],
      });
    }
  },
};
