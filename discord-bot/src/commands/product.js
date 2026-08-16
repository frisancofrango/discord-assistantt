import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('product')
    .setDescription('Gerencia produtos, estoque, variantes e preços do catálogo.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('criar')
        .setDescription('Cadastra um novo produto no catálogo.')
        .addStringOption(o => o.setName('sku').setDescription('Código único SKU (ex: nitro_mensal)').setRequired(true))
        .addStringOption(o => o.setName('nome').setDescription('Nome do produto (ex: Discord Nitro 1 Mês)').setRequired(true))
        .addNumberOption(o => o.setName('preco').setDescription('Preço em R$ (ex: 29.90)').setRequired(true))
        .addIntegerOption(o => o.setName('estoque').setDescription('Estoque inicial (deixe vazio para ilimitado)').setRequired(false))
        .addStringOption(o => o.setName('descricao').setDescription('Descrição do produto').setRequired(false))
    )
    .addSubcommand(sc => sc.setName('listar').setDescription('Lista todos os produtos cadastrados.')),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de produtos indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'criar') {
      const sku = interaction.options.getString('sku');
      const name = interaction.options.getString('nome');
      const price = interaction.options.getNumber('preco');
      const stock = interaction.options.getInteger('estoque');
      const desc = interaction.options.getString('descricao') || 'Produto verificado.';
      const priceMinor = Math.round(price * 100);

      const p = await native.commerce.upsertProduct({
        sku,
        name,
        description: desc,
        acceptableUse: 'Goods',
        variants: [{ sku: `${sku}_def`, name: `${name} Standard`, priceMinor, currency: 'BRL', stock }],
      }, ctx);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'PRODUTO CRIADO', body: `Produto **${p.name}** (\`${p.sku}\`) cadastrado por **${formatMoney(priceMinor, 'BRL')}**.` })],
      });
    }

    const products = await native.commerce.listProducts(interaction.guildId);
    const lines = products.map(p => `> **${p.name}** (\`${p.sku}\`) — ${formatMoney(p.variants?.[0]?.priceMinor || 0, 'BRL')}`).join('\n') || 'Nenhum produto cadastrado.';

    return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'CATÁLOGO DE PRODUTOS', body: lines })] });
  },
};
