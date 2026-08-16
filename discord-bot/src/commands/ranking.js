import { SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, formatMoney } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Exibe o Ranking dos Maiores Compradores do Servidor (Top Spenders).'),

  async execute(interaction, client) {
    const db = client.runtime?.db;
    if (!db) {
      return interaction.reply({ content: 'Database unavailable.', ephemeral: true });
    }

    try {
      const { rows } = await db.query(
        `SELECT member_id, total_spend_minor, current_tier, total_purchases
         FROM member_loyalty
         WHERE guild_id = $1
         ORDER BY total_spend_minor DESC
         LIMIT 10`,
        [interaction.guildId]
      );

      if (!rows.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: '🏆 RANKING DE COMPRADORES',
              body: 'Nenhuma compra registrada ainda neste servidor. Seja o primeiro a comprar e liderar o ranking!',
            }),
          ],
        });
      }

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const tierBadges = {
        member: '👤 Membro',
        bronze: '🥉 Bronze (1% Cashback)',
        silver: '🥈 Prata (2% Cashback)',
        gold: '🥇 Ouro (4% Cashback)',
        diamond: '💎 Diamante (7% Cashback)',
        obsidian: '👑 Obsidiana (10% Cashback)',
      };

      const lines = rows.map((r, i) => {
        const medal = medals[i] || '▫️';
        const spend = formatMoney(r.total_spend_minor, 'BRL');
        const badge = tierBadges[r.current_tier] || r.current_tier;
        return `### ${medal} <@${r.member_id}>\n> **Gasto Total:** **${spend}** (${r.total_purchases} pedidos)\n> **Nível VIP:** ${badge}`;
      }).join('\n\n');

      return interaction.reply({
        flags: V2,
        components: [
          panel({
            title: '🏆 RANKING DOS TOP CLIENTES VIP',
            subtitle: 'Os membros mais fiéis e maiores compradores da comunidade',
            body: lines,
            footer: 'Atualizado em tempo real · Acumule compras para subir de nível e ganhar cashback',
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERRO', body: err.message })] });
    }
  },
};
