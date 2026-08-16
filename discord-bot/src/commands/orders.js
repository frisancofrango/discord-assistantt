import { SlashCommandBuilder } from 'discord.js';
import { panel, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('orders')
    .setDescription('Consulta seu histórico de compras, comprovantes e status de entrega.'),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de pedidos indisponível.', ephemeral: true });

    const orders = await native.commerce.listMemberOrders(interaction.guildId, interaction.user.id, 10);
    const lines = orders.map(o => `> **Pedido \`${o.id.slice(0, 8)}...\`** — **${o.status.toUpperCase()}** (${formatMoney(o.subtotalMinor, o.currency || 'BRL')})`).join('\n') || 'Você ainda não possui pedidos registrados.';

    return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'MEUS PEDIDOS', body: lines })] });
  },
};
