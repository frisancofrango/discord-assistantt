import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, formatMoney, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('marketing')
    .setDescription('Flash Drops, ofertas relâmpago e avaliações de clientes.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('drop')
        .setDescription('Cria uma oferta relâmpago (Flash Drop) com contagem regressiva.')
        .addStringOption(o => o.setName('titulo').setDescription('Título do drop').setRequired(true))
        .addStringOption(o => o.setName('variante_id').setDescription('ID da variante do produto').setRequired(true))
        .addNumberOption(o => o.setName('preco').setDescription('Preço promocional em R$ (ex: 19.90)').setRequired(true))
        .addIntegerOption(o => o.setName('duracao_horas').setDescription('Duração em horas (ex: 2)').setRequired(true).setMinValue(1).setMaxValue(72))
    )
    .addSubcommand(sc => sc.setName('avaliacoes').setDescription('Exibe as últimas avaliações de clientes registradas.')),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de marketing indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'drop') {
      const title = interaction.options.getString('titulo');
      const variantId = interaction.options.getString('variante_id');
      const price = interaction.options.getNumber('preco');
      const hours = interaction.options.getInteger('duracao_horas');

      const drop = await native.marketing.createFlashDrop({
        guildId: interaction.guildId,
        title,
        variantId,
        dropPriceMinor: Math.round(price * 100),
        durationHours: hours,
      }, ctx);

      const timeStr = `<t:${Math.floor(new Date(drop.expiresAt).getTime() / 1000)}:R>`;

      return interaction.reply({
        flags: V2,
        components: [
          panel({
            title: `⚡ FLASH DROP: ${drop.title.toUpperCase()}`,
            body:
              `> **Preço Relâmpago:** **${formatMoney(drop.dropPriceMinor, 'BRL')}**\n` +
              `> **Expira em:** ${timeStr}`,
            buttons: [button.primary(`buy:${drop.variantId}`, '⚡ Comprar Agora')],
          }),
        ],
      });
    }

    const reviews = await native.marketing.listReviews(interaction.guildId, 10);
    const lines = reviews.map(r => `> ${'⭐'.repeat(r.rating)} por <@${r.userId}>: *"${r.feedbackText || 'Sem comentário'}"*`).join('\n') || 'Nenhuma avaliação registrada ainda.';

    return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'AVALIAÇÕES DE CLIENTES', body: lines })] });
  },
};
