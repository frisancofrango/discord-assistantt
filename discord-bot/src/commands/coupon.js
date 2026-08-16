import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button, formatMoney } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coupon')
    .setDescription('Manage promotional discount codes for the store.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('list').setDescription('List all promotional discount codes.')
    )
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Create a new promotional discount coupon.')
        .addStringOption((o) =>
          o.setName('code').setDescription('Coupon code (e.g. SUMMER25)').setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName('percent').setDescription('Percentage discount (1-100)').setRequired(false)
        )
        .addNumberOption((o) =>
          o.setName('amount').setDescription('Fixed discount in USD (e.g. 5.00)').setRequired(false)
        )
        .addNumberOption((o) =>
          o.setName('min_order').setDescription('Minimum order amount in USD').setRequired(false)
        )
        .addIntegerOption((o) =>
          o.setName('max_uses').setDescription('Maximum redemption limit').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('delete')
        .setDescription('Deactivate a promotional coupon.')
        .addStringOption((o) =>
          o.setName('code').setDescription('Coupon code to deactivate').setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const coupons = client.runtime?.native?.coupons;
    if (!coupons) {
      return interaction.reply({ content: 'Coupon service is currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'list') {
      const list = await coupons.listCoupons(interaction.guildId);
      if (!list.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'PROMO COUPONS', body: 'No promotional codes found on this server.' })],
        });
      }

      const lines = list.map((c) => {
        const discount = c.discountPercent ? `${c.discountPercent}% OFF` : `${formatMoney(c.discountMinor, 'USD')} OFF`;
        const uses = c.maxUses ? `Used: ${c.usedCount}/${c.maxUses}` : `Used: ${c.usedCount} (Unlimited)`;
        const minOrder = c.minOrderMinor > 0 ? ` · Min: ${formatMoney(c.minOrderMinor, 'USD')}` : '';
        const status = c.active ? '🟢 ACTIVE' : '🔴 INACTIVE';
        return `> **\`${c.code}\`** — **${discount}** (${uses}${minOrder}) [${status}]`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'STORE PROMO COUPONS',
            subtitle: `${list.length} configured code(s)`,
            body: lines,
            buttons: [button.primary('panel:coupon:create_modal', '➕ Create New Coupon')],
          }),
        ],
      });
    }

    if (sub === 'create') {
      const code = interaction.options.getString('code', true);
      const percent = interaction.options.getInteger('percent');
      const amount = interaction.options.getNumber('amount');
      const minOrder = interaction.options.getNumber('min_order');
      const maxUses = interaction.options.getInteger('max_uses');

      const discountMinor = amount ? Math.round(amount * 100) : null;
      const minOrderMinor = minOrder ? Math.round(minOrder * 100) : 0;

      try {
        const created = await coupons.createCoupon(
          {
            guildId: interaction.guildId,
            code,
            discountPercent: percent,
            discountMinor,
            minOrderMinor,
            maxUses,
          },
          ctx
        );

        const discountStr = created.discountPercent ? `${created.discountPercent}% OFF` : `${formatMoney(created.discountMinor, 'USD')} OFF`;

        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'COUPON CREATED',
              body: `Coupon **\`${created.code}\`** is now active for **${discountStr}**!`,
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'COUPON CREATION FAILED', body: err.message })],
        });
      }
    }

    if (sub === 'delete') {
      const code = interaction.options.getString('code', true);
      const list = await coupons.listCoupons(interaction.guildId);
      const target = list.find((c) => c.code.toUpperCase() === code.toUpperCase());

      if (!target) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NOT FOUND', body: `Coupon **${code}** was not found.` })],
        });
      }

      await coupons.deleteCoupon(interaction.guildId, target.id, ctx);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [notice({ title: 'COUPON DEACTIVATED', body: `Coupon **\`${code.toUpperCase()}\`** has been disabled.` })],
      });
    }
  },
};
