import { SlashCommandBuilder } from 'discord.js';
import { panel, button, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('escrow')
    .setDescription('Sistema de custódia segura (Escrow) para trocas P2P.')
    .addSubcommand(sc =>
      sc.setName('criar')
        .setDescription('Cria uma nova sala de custódia intermediada.')
        .addUserOption(o => o.setName('vendedor').setDescription('Membro que irá entregar o produto/serviço').setRequired(true))
        .addNumberOption(o => o.setName('valor').setDescription('Valor da transação em R$ (ex: 50.00)').setRequired(true))
        .addStringOption(o => o.setName('descricao').setDescription('O que está sendo negociado').setRequired(true))
    )
    .addSubcommand(sc => sc.setName('minhas').setDescription('Lista suas custódias em andamento.')),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de custódia indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'criar') {
      const seller = interaction.options.getUser('vendedor');
      const amountVal = interaction.options.getNumber('valor');
      const desc = interaction.options.getString('descricao');
      const amountMinor = Math.round(amountVal * 100);

      const deal = await native.escrow.createDeal({
        guildId: interaction.guildId,
        buyerId: interaction.user.id,
        sellerId: seller.id,
        amountMinor,
        currency: 'BRL',
        description: desc,
      }, ctx);

      return interaction.reply({
        flags: V2,
        components: [
          panel({
            title: `CUSTÓDIA SEGURA #${deal.id.slice(0, 8)}`,
            body:
              `> **Comprador:** <@${deal.buyerId}>\n` +
              `> **Vendedor:** <@${deal.sellerId}>\n` +
              `> **Valor em Cofre:** **${formatMoney(deal.amountMinor, 'BRL')}**\n` +
              `> **Item/Acordo:** ${deal.description}\n\n` +
              `*O comprador deve depositar o saldo no cofre para iniciar o processo com garantia.*`,
            buttons: [
              button.primary(`escrow:fund:${deal.id}`, '🔒 Depositar no Cofre'),
              button.neutral(`escrow:deliver:${deal.id}`, '📦 Confirmar Entrega (Vendedor)'),
              button.neutral(`escrow:release:${deal.id}`, '✅ Liberar Pagamento (Comprador)'),
              button.danger(`escrow:dispute:${deal.id}`, '⚠️ Abrir Disputa'),
            ],
          }),
        ],
      });
    }

    const deals = await native.escrow.listMemberDeals(interaction.guildId, interaction.user.id);
    const lines = deals.map(d => `> **\`${d.id.slice(0, 8)}\`** — **${formatMoney(d.amountMinor, 'BRL')}** (${d.status.toUpperCase()})`).join('\n') || 'Nenhuma custódia ativa.';

    return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'MINHAS TRANSAÇÕES EM CUSTÓDIA', body: lines })] });
  },
};
