import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('license')
    .setDescription('Gerencia chaves seriais e estoque de produtos digitais.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('adicionar')
        .setDescription('Adiciona chaves seriais ao estoque de uma variante.')
        .addStringOption(o => o.setName('variante_id').setDescription('ID da variante do produto').setRequired(true))
        .addStringOption(o => o.setName('chaves').setDescription('Chaves separadas por vírgula ou ponto-e-vírgula').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('estoque')
        .setDescription('Consulta a contagem de chaves disponíveis.')
        .addStringOption(o => o.setName('variante_id').setDescription('ID da variante do produto').setRequired(true))
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de licenças indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const variantId = interaction.options.getString('variante_id');
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'adicionar') {
      const raw = interaction.options.getString('chaves');
      const keys = raw.split(/[,;\n]+/).map(k => k.trim()).filter(k => k.length > 0);
      const res = await native.license.addKeys(variantId, keys, ctx);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'CHAVES ADICIONADAS', body: `Adicionadas **${res.addedCount}** chaves. Disponíveis no total: **${res.totalUnused}**.` })],
      });
    }

    const available = await native.license.countAvailableKeys(variantId);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'ESTOQUE DE LICENÇAS', body: `Chaves não utilizadas disponíveis para entrega: **${available}**.` })],
    });
  },
};
