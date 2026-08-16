import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2 } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vendor')
    .setDescription('Multi-Seller Vendor Management & Automated Split Payouts.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Assign a vendor user and platform commission cut to a product.')
        .addStringOption((o) => o.setName('product_id').setDescription('Product ID or SKU').setRequired(true))
        .addUserOption((o) => o.setName('vendor_user').setDescription('The vendor Discord user').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('commission').setDescription('Platform commission cut % (e.g. 10 for 10% server cut)').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('info')
        .setDescription('Inspect vendor split configuration for a product.')
        .addStringOption((o) => o.setName('product_id').setDescription('Product ID or SKU').setRequired(true))
    ),

  async execute(interaction, client) {
    const vendorSvc = client.runtime?.native?.vendor;
    if (!vendorSvc) {
      return interaction.reply({ content: 'Vendor Service is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'set') {
      const productId = interaction.options.getString('product_id', true);
      const user = interaction.options.getUser('vendor_user', true);
      const commission = interaction.options.getInteger('commission') ?? 10;

      try {
        const row = await vendorSvc.setVendor(productId, user.id, commission, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            panel({
              title: '🤝 VENDEDOR VINCULADO COM SUCESSO',
              body:
                `> **Produto:** \`${productId}\`\n` +
                `> **Vendedor Parceiro:** <@${user.id}>\n` +
                `> **Taxa da Loja:** **${row.commission_percent}%** (Vendedor recebe **${100 - row.commission_percent}%** automaticamente no saldo da carteira a cada venda)`,
              footer: 'Sistema de Revenda & Split de Pagamentos',
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERRO', body: err.message })] });
      }
    }

    if (sub === 'info') {
      const productId = interaction.options.getString('product_id', true);
      const row = await vendorSvc.getVendor(productId);

      if (!row) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NENHUM VENDEDOR VINCULADO', body: `O produto \`${productId}\` pertence diretamente à administração.` })],
        });
      }

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: `CONFIGURAÇÃO DE REVENDA: ${productId}`,
            body:
              `> **Vendedor:** <@${row.vendor_user_id}>\n` +
              `> **Taxa do Servidor:** **${row.commission_percent}%**\n` +
              `> **Repasse ao Vendedor:** **${100 - row.commission_percent}%**\n` +
              `> **Data de Cadastro:** <t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:D>`,
            footer: 'Azure Vendor Engine',
          }),
        ],
      });
    }
  },
};
