import { SlashCommandBuilder } from 'discord.js';
import { panel, button, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('affiliate')
    .setDescription('Programa de afiliados e comissões automáticas por indicação.')
    .addSubcommand(sc => sc.setName('status').setDescription('Consulta seu link de afiliado, conversões e comissões acumuladas.'))
    .addSubcommand(sc =>
      sc.setName('config')
        .setDescription('Configura a taxa de comissão de afiliados (Apenas Administradores).')
        .addIntegerOption(o => o.setName('percentual').setDescription('Porcentagem de comissão (ex: 10 para 10%)').setRequired(true).setMinValue(1).setMaxValue(50))
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de afiliados indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'config') {
      if (!interaction.memberPermissions?.has('Administrator')) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'PERMISSÃO NEGADA', body: 'Apenas administradores podem configurar comissões.' })] });
      }
      const percent = interaction.options.getInteger('percentual');
      await native.settings.updateSettings(interaction.guildId, { affiliateCommissionPercent: percent }, ctx);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'COMISSÃO ATUALIZADA', body: `Taxa de comissão de afiliados definida para **${percent}%**.` })],
      });
    }

    const stats = await native.affiliate.getAffiliateStats(interaction.guildId, interaction.user.id);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'MEU PAINEL DE AFILIADO',
          body:
            `> **Código de Indicação:** **\`${stats.code}\`**
` +
            `> **Vendas Convertidas:** **${stats.totalReferredOrders}** pedidos
` +
            `> **Comissão Total Recebida:** **${formatMoney(stats.totalCommissionMinor, 'BRL')}**

` +
            `Compartilhe seu link ou código e receba comissões automáticas diretamente na sua carteira a cada compra!`,
          buttons: [button.primary('wallet:view', '💳 Ver Saldo')],
        }),
      ],
    });
  },
};
