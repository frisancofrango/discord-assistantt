import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pix')
    .setDescription('Central de pagamentos instantâneos PIX (Copia e Cola & QR Code).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('configurar')
        .setDescription('Configura a chave PIX estática e titular da conta.')
        .addStringOption(o => o.setName('chave').setDescription('Sua chave PIX (E-mail, CPF, CNPJ, Celular ou Aleatória)').setRequired(true))
        .addStringOption(o => o.setName('titular').setDescription('Nome do titular da conta bancária').setRequired(true))
        .addStringOption(o => o.setName('cidade').setDescription('Cidade do titular (ex: SAO PAULO)').setRequired(false))
    )
    .addSubcommand(sc =>
      sc.setName('cobrar')
        .setDescription('Gera uma cobrança PIX imediata.')
        .addNumberOption(o => o.setName('valor').setDescription('Valor em R$ (ex: 25.50)').setRequired(true))
        .addStringOption(o => o.setName('descricao').setDescription('Descrição do pagamento').setRequired(false))
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Gateway PIX indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'configurar') {
      const key = interaction.options.getString('chave');
      const name = interaction.options.getString('titular');
      const city = interaction.options.getString('cidade') || 'SAO PAULO';

      await native.pix.setPixConfig(interaction.guildId, { enabled: true, pixKey: key, receiverName: name, receiverCity: city }, ctx);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'PIX CONFIGURADO', body: `Chave PIX **\`${key}\`** registrada para **${name}** (${city}).` })],
      });
    }

    const amount = interaction.options.getNumber('valor');
    const desc = interaction.options.getString('descricao') || 'Pagamento Loop';
    const amountMinor = Math.round(amount * 100);

    const invoice = await native.pix.createInvoice({
      orderId: `manual_${Date.now()}`,
      amountMinor,
      currency: 'BRL',
      description: desc,
      guildId: interaction.guildId,
    });

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'COBRANÇA PIX GERADA',
          body:
            `Copie o código **PIX Copia e Cola** abaixo:\n\`\`\`\n${invoice.qrCode}\n\`\`\`\n` +
            `> **Valor:** **\`${formatMoney(amountMinor, 'BRL')}\`**\n` +
            `> **Validade:** 15 minutos`,
          buttons: [button.primary(`pix:verify:${invoice.id}`, '🔄 Verificar Pagamento')],
        }),
      ],
    });
  },
};
