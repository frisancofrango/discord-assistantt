import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { operatorDashboardPanel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Open the visual multi-tab Azure Operator Control Center.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) {
      return interaction.reply({ content: 'Operator system is unavailable.', ephemeral: true });
    }

    const settings = await native.settings.getSettings(interaction.guildId);
    const products = await native.commerce.listProducts(interaction.guildId);
    const coupons = await native.coupons.listCoupons(interaction.guildId);
    const pixConfig = await native.pix.getPixConfig(interaction.guildId);
    const commerceChannels = await native.cartChannel.getCommerceChannels(interaction.guildId);
    const vendorsCount = (await client.runtime.db.query(`SELECT count(DISTINCT vendor_user_id)::int as count FROM product_vendors`, [])).rows[0]?.count || 0;

    const panel = operatorDashboardPanel({
      category: 'commerce',
      guildId: interaction.guildId,
      settings,
      data: {
        products,
        coupons,
        pixConfig,
        commerceChannels,
        vendorsCount,
      },
    });

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel],
    });
  },
};

