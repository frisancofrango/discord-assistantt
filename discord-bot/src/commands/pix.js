import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pix')
    .setDescription('Brazilian PIX Gateway & Instant Payment Settlement Engine.')
    .addSubcommand((s) =>
      s
        .setName('config')
        .setDescription('Configure Mercado Pago / PIX credentials for this server.')
        .addStringOption((o) =>
          o.setName('token').setDescription('Mercado Pago Access Token (APP_USR-...)').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('key').setDescription('PIX Key (Email, CPF/CNPJ, Telefone, ou Aleatória)').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('generate')
        .setDescription('Generate an instant PIX Copia e Cola test charge.')
        .addNumberOption((o) =>
          o.setName('amount').setDescription('Valor em Reais (Ex: 15.00)').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('description').setDescription('Descrição do pagamento').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Check the payment status of a PIX invoice.')
        .addStringOption((o) =>
          o.setName('invoice_id').setDescription('PIX Invoice ID (pix_...)').setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const pixService = client.runtime?.native?.pix;
    if (!pixService) {
      return interaction.reply({ content: 'PIX Service is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'config') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'Permission denied: ManageGuild required.', ephemeral: true });
      }

      const token = interaction.options.getString('token', true);
      const key = interaction.options.getString('key') || null;

      try {
        await pixService.setConfig(interaction.guildId, { accessToken: token, pixKey: key, enabled: true }, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: '🇧🇷 CONFIGURAÇÃO PIX SALVA',
              body: `Gateway PIX configurado com sucesso para este servidor.\nChave Cadastrada: \`${key || 'Padrão'}\``,
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERRO NA CONFIGURAÇÃO', body: err.message })] });
      }
    }

    if (sub === 'generate') {
      const amount = interaction.options.getNumber('amount', true);
      const desc = interaction.options.getString('description') || 'Teste de Pagamento PIX';
      const amountMinor = Math.round(amount * 100);

      try {
        const invoice = await pixService.createInvoice({
          orderId: `test_${Date.now()}`,
          amountMinor,
          currency: 'BRL',
          description: desc,
          guildId: interaction.guildId,
        });

        const timeStr = `<t:${Math.floor(new Date(invoice.expiresAt).getTime() / 1000)}:R>`;

        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            panel({
              title: '🇧🇷 PAGAMENTO VIA PIX (TESTE)',
              subtitle: `Valor: R$ ${(amountMinor / 100).toFixed(2).replace('.', ',')}`,
              body:
                `Copie o código **PIX Copia e Cola** abaixo e pague no app do seu banco:\n\n` +
                `\`\`\`\n${invoice.qrCode}\n\`\`\`\n` +
                `> **Vencimento:** ${timeStr}\n` +
                `> **Status:** \`${invoice.status.toUpperCase()}\``,
              buttons: [
                button.primary(`pix:verify:${invoice.id}`, '🔄 Verificar Pagamento'),
              ],
              footer: 'Banco Central do Brasil · Pagamento Instantâneo',
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERRO AO GERAR PIX', body: err.message })] });
      }
    }

    if (sub === 'status') {
      const invoiceId = interaction.options.getString('invoice_id', true);
      const invoice = await pixService.getInvoice(invoiceId);

      if (!invoice) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'FATURA NÃO ENCONTRADA', body: `Nenhum registro com ID \`${invoiceId}\`.` })],
        });
      }

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: `FATURA PIX: ${invoice.id}`,
            body:
              `> **Valor:** R$ ${(invoice.amount_minor / 100).toFixed(2).replace('.', ',')}\n` +
              `> **Status:** **\`${invoice.status.toUpperCase()}\`**\n` +
              `> **Criado em:** <t:${Math.floor(new Date(invoice.created_at).getTime() / 1000)}:F>`,
            footer: 'Sistema Financeiro Loop',
          }),
        ],
      });
    }
  },
};
