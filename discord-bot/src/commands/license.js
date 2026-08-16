import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('license')
    .setDescription('Digital goods license key pool and serial number dispenser.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a batch of digital license keys to a product variant.')
        .addStringOption((o) =>
          o.setName('variant_id').setDescription('Product Variant ID').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('keys').setDescription('Comma-separated list of keys or tokens').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('pool')
        .setDescription('Inspect license key stock and claim stats for a variant.')
        .addStringOption((o) =>
          o.setName('variant_id').setDescription('Product Variant ID').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('List recent license keys and redemption status for a variant.')
        .addStringOption((o) =>
          o.setName('variant_id').setDescription('Product Variant ID').setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const license = client.runtime?.native?.license;
    if (!license) {
      return interaction.reply({ content: 'License service is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'add') {
      const variantId = interaction.options.getString('variant_id', true);
      const rawKeys = interaction.options.getString('keys', true);
      const keys = rawKeys.split(/[\n,;]+/).map((k) => k.trim()).filter((k) => k.length > 0);

      try {
        const result = await license.addKeys(variantId, keys, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'LICENSE KEYS ADDED',
              body:
                `Successfully added **${result.addedCount}** key(s) to keypool.\n\n` +
                `> **Total Available Unused:** **${result.totalUnused}**\n` +
                `> **Variant ID:** \`${variantId}\``,
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'ERROR', body: err.message })],
        });
      }
    }

    if (sub === 'pool') {
      const variantId = interaction.options.getString('variant_id', true);
      const pool = await license.getKeyPool(variantId);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'DIGITAL KEYPOOL STATUS',
            subtitle: `Variant: \`${variantId}\``,
            body:
              `> **Available Unused Keys:** **${pool.unusedKeys}**\n` +
              `> **Claimed / Redeemed Keys:** **${pool.claimedKeys}**\n` +
              `> **Total Key Inventory:** **${pool.totalKeys}**`,
            buttons: [button.primary('panel:tab:commerce', '📦 Manage in Commerce Center')],
          }),
        ],
      });
    }

    if (sub === 'list') {
      const variantId = interaction.options.getString('variant_id', true);
      const list = await license.listKeys(variantId, 15);

      if (!list.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'KEYPOOL EMPTY', body: `No keys found in keypool for variant \`${variantId}\`.` })],
        });
      }

      const lines = list.map((k) => {
        const status = k.isUsed ? `🔴 REDEEMED by <@${k.redeemedBy}>` : '🟢 UNCLAIMED';
        return `> \`${k.licenseKey}\` — ${status}`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'KEYPOOL AUDIT',
            subtitle: `${list.length} key(s) shown`,
            body: lines,
          }),
        ],
      });
    }
  },
};
