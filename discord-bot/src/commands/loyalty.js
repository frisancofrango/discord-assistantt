import { SlashCommandBuilder } from 'discord.js';
import { panel, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loyalty')
    .setDescription('Consulta seu nível VIP, taxa de cashback e histórico de recompensas.'),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de fidelidade indisponível.', ephemeral: true });

    const loyalty = await native.loyalty.getMemberLoyalty(interaction.guildId, interaction.user.id);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: `NÍVEL VIP: ${loyalty.tier.name.toUpperCase()}`,
          body:
            `> **Cashback Atual:** **\`${loyalty.tier.cashbackPercent}%\`** de volta em todas as compras\n` +
            `> **Gasto Acumulado:** **${formatMoney(loyalty.lifetimeSpentMinor, 'BRL')}**\n` +
            `> **Cashback Total Ganho:** **${formatMoney(loyalty.totalCashbackEarnedMinor, 'BRL')}**`,
        }),
      ],
    });
  },
};
