import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('coupon')
    .setDescription('Cria e gerencia cupons de desconto para a loja.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('criar')
        .setDescription('Cria um novo cupom de desconto.')
        .addStringOption(o => o.setName('codigo').setDescription('Código do cupom (ex: LOOP10)').setRequired(true))
        .addIntegerOption(o => o.setName('porcentagem').setDescription('Desconto em porcentagem (ex: 10)').setRequired(false).setMinValue(1).setMaxValue(100))
        .addNumberOption(o => o.setName('valor_fixo').setDescription('Desconto em valor fixo em R$ (ex: 5.00)').setRequired(false))
        .addIntegerOption(o => o.setName('limite_usos').setDescription('Quantidade máxima de resgates').setRequired(false))
    )
    .addSubcommand(sc => sc.setName('listar').setDescription('Lista os cupons de desconto ativos.')),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de cupons indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'criar') {
      const code = interaction.options.getString('codigo').toUpperCase();
      const percent = interaction.options.getInteger('porcentagem');
      const fixed = interaction.options.getNumber('valor_fixo');
      const maxUses = interaction.options.getInteger('limite_usos');

      const discountMinor = fixed ? Math.round(fixed * 100) : null;
      const c = await native.coupons.createCoupon({ guildId: interaction.guildId, code, discountPercent: percent, discountMinor, maxUses }, ctx);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'CUPOM CRIADO', body: `Cupom **\`${c.code}\`** ativado com sucesso.` })],
      });
    }

    const list = await native.coupons.listCoupons(interaction.guildId);
    const lines = list.map(c => `> **\`${c.code}\`** — ${c.discountPercent ? `${c.discountPercent}% OFF` : formatMoney(c.discountMinor, 'BRL')} (${c.usedCount}/${c.maxUses || '∞'})`).join('\n') || 'Nenhum cupom cadastrado.';

    return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'CUPONS DE DESCONTO', body: lines })] });
  },
};
