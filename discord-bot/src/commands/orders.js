import { SlashCommandBuilder } from 'discord.js';
import { notice, orderReceiptPanel, V2, formatMoney, THEME } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('orders')
    .setDescription('View your purchase history, receipts, and order statuses.')
    .addSubcommand((s) =>
      s.setName('list').setDescription('List your recent orders and receipts.')
    )
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('View detailed receipt for a specific order.')
        .addStringOption((o) => o.setName('order_id').setDescription('Order UUID').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('fulfill')
        .setDescription('(Staff) Manually fulfill a pending or paid order.')
        .addStringOption((o) => o.setName('order_id').setDescription('Order UUID').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('mechanism')
            .setDescription('Delivery mechanism')
            .setRequired(false)
            .addChoices(
              { name: 'Role Grant', value: 'role_grant' },
              { name: 'Private Channel / DM', value: 'private_channel' },
              { name: 'Download Token / Key', value: 'download_token' },
              { name: 'Manual Delivery', value: 'manual' }
            )
        )
    ),

  async execute(interaction, client) {
    const commerce = client.runtime?.native?.commerce;
    if (!commerce) {
      return interaction.reply({ content: 'Commerce services are currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'list') {
      const orders = await commerce.listMemberOrders(interaction.guildId, interaction.user.id, 10);
      if (!orders.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'NO ORDERS FOUND',
              body: 'You have not placed any orders on this server yet.\nUse `/sales` to browse available products.',
            }),
          ],
        });
      }

      const lines = orders.map((o) => {
        const total = formatMoney(o.subtotalMinor, o.currency);
        const time = `<t:${Math.floor(new Date(o.created_at).getTime() / 1000)}:R>`;
        const items = o.items.map((i) => `${i.name} (x${i.quantity})`).join(', ');
        return `> **Order \`${o.id.slice(0, 8)}...\`** — **${o.status.toUpperCase()}**\n> Items: ${items}\n> Total: **${total}** — ${time}`;
      }).join('\n\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'MY ORDERS',
            body: lines,
            footer: 'Use /orders view <order_id> for full receipt details.',
          }),
        ],
      });
    }

    if (sub === 'view') {
      const orderId = interaction.options.getString('order_id', true);
      const order = await commerce.getOrder(orderId);

      if (!order || (order.member_id !== interaction.user.id && !interaction.memberPermissions?.has('ManageGuild'))) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NOT FOUND', body: `Order \`${orderId}\` was not found or access is denied.` })],
        });
      }

      const panel = orderReceiptPanel({
        order,
        items: order.items,
        mechanism: order.fulfillment?.mechanism || 'instant',
        verified: true,
      });

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel],
      });
    }

    if (sub === 'fulfill') {
      if (!interaction.memberPermissions?.has('ManageGuild')) {
        return interaction.reply({ content: 'Only staff can manually fulfill orders.', ephemeral: true });
      }

      const orderId = interaction.options.getString('order_id', true);
      const mechanism = interaction.options.getString('mechanism') || 'manual';

      try {
        const res = await commerce.fulfill(orderId, mechanism, { fulfilledBy: interaction.user.tag, timestamp: new Date().toISOString() }, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'ORDER FULFILLED',
              body: `Order \`${orderId}\` marked as **fulfilled** via \`${res.mechanism}\`.`,
              footer: 'Fulfillment receipt persisted.',
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'FULFILLMENT FAILED', body: err.message })],
        });
      }
    }
  },
};
