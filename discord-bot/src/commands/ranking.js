import { SlashCommandBuilder } from 'discord.js';
import { panel, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Exibe o ranking dos maiores compradores do servidor (Top Spenders).'),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de ranking indisponível.', ephemeral: true });

    const rows = (await client.runtime.db.query(
      `SELECT member_id, sum(subtotal_minor)::bigint as total_spent, count(id)::int as total_orders
       FROM orders WHERE guild_id = $1 AND status = 'fulfilled'
       GROUP BY member_id ORDER BY total_spent DESC LIMIT 10`,
      [interaction.guildId]
    )).rows;

    const medals = ['🥇', '🥈', '🥉', '🏅', '🏅', '🏅', '🏅', '🏅', '🏅', '🏅'];
    const lines = rows.map((r, i) => `${medals[i] || '•'} <@${r.member_id}> — **${formatMoney(Number(r.total_spent), 'BRL')}** (${r.total_orders} compras)`).join('\n') || 'Nenhuma compra registrada ainda.';

    return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'TOP COMPRADORES DO SERVIDOR', body: lines })] });
  },
};
