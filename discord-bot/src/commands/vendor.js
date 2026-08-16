import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vendor')
    .setDescription('Gestão de múltiplos vendedores e split automatizado de pagamentos.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('adicionar')
        .setDescription('Cadastra um parceiro lojista para uma variante de produto.')
        .addStringOption(o => o.setName('variante_id').setDescription('ID da variante do produto').setRequired(true))
        .addUserOption(o => o.setName('vendedor').setDescription('Membro que receberá o repasse').setRequired(true))
        .addIntegerOption(o => o.setName('porcentagem').setDescription('Porcentagem de comissão do vendedor (ex: 80 para 80%)').setRequired(true).setMinValue(1).setMaxValue(99))
    )
    .addSubcommand(sc =>
      sc.setName('consultar')
        .setDescription('Consulta os dados de split configurados para uma variante.')
        .addStringOption(o => o.setName('variante_id').setDescription('ID da variante do produto').setRequired(true))
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de parceiros indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const variantId = interaction.options.getString('variante_id');
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'adicionar') {
      const user = interaction.options.getUser('vendedor');
      const percent = interaction.options.getInteger('porcentagem');

      const v = await native.vendor.setVendor(interaction.guildId, variantId, user.id, percent, ctx);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'VENDEDOR CADASTRADO', body: `Variante \`${variantId}\` vinculada a <@${v.vendor_user_id}> com split de **${v.split_percent}%**.` })],
      });
    }

    const vendor = await native.vendor.getVendor(variantId);
    if (!vendor) return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'SEM VENDEDOR', body: 'Nenhum split de vendedor cadastrado para esta variante.' })] });

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'DADOS DO VENDEDOR', body: `> **Lojista:** <@${vendor.vendor_user_id}>\n> **Comissão:** **\`${vendor.split_percent}%\`**` })],
    });
  },
};
