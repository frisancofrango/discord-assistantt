import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { notice, V2, formatMoney } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('product')
    .setDescription('Manage catalog products, variants, pricing, and live inventory.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('list').setDescription('List all registered products and variants with stock.')
    )
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a new product to the catalog.')
        .addStringOption((o) => o.setName('sku').setDescription('Unique product SKU (e.g. vip_pass)').setRequired(true))
        .addStringOption((o) => o.setName('name').setDescription('Display name of the product').setRequired(true))
        .addNumberOption((o) => o.setName('price').setDescription('Price in dollars (e.g. 15.00)').setRequired(true).setMinValue(0.5))
        .addStringOption((o) => o.setName('description').setDescription('Short product description').setRequired(false))
        .addIntegerOption((o) => o.setName('stock').setDescription('Available stock quantity (leave empty for infinite)').setRequired(false))
        .addStringOption((o) => o.setName('currency').setDescription('Currency (USD, BRL, EUR)').setRequired(false))
    )
    .addSubcommand((s) =>
      s
        .setName('stock')
        .setDescription('Update inventory stock for a product variant.')
        .addStringOption((o) => o.setName('sku').setDescription('Product variant SKU').setRequired(true))
        .addIntegerOption((o) => o.setName('quantity').setDescription('New stock level (0 for out of stock)').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Deactivate a product from the storefront.')
        .addStringOption((o) => o.setName('sku').setDescription('Product SKU to remove').setRequired(true))
    ),

  async execute(interaction, client) {
    const commerce = client.runtime?.native?.commerce;
    const db = client.runtime?.db;
    if (!commerce || !db) {
      return interaction.reply({ content: 'Commerce services are currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'list') {
      const products = await commerce.listProducts(interaction.guildId);
      if (!products.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'CATALOG EMPTY', body: 'No products are currently configured for this server.' })],
        });
      }

      const lines = products.map((p) => {
        const vList = p.variants.map((v) => {
          const stock = v.stock !== null ? `${v.stock - v.reserved}/${v.stock}` : '∞';
          return `> SKU: \`${v.sku}\` — **${formatMoney(v.priceMinor, v.currency)}** (Stock: ${stock})`;
        }).join('\n');
        return `### ${p.name} (\`${p.sku}\`)\n${p.description || 'No description'}\n${vList}`;
      }).join('\n\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'PRODUCT CATALOG',
            body: lines,
            footer: 'Use /product add, /product stock, or /product remove to modify.',
          }),
        ],
      });
    }

    if (sub === 'add') {
      const sku = interaction.options.getString('sku', true).toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const name = interaction.options.getString('name', true);
      const price = interaction.options.getNumber('price', true);
      const priceMinor = Math.round(price * 100);
      const description = interaction.options.getString('description') || 'Legitimate digital goods.';
      const stock = interaction.options.getInteger('stock');
      const currency = (interaction.options.getString('currency') || 'USD').toUpperCase();

      try {
        const prod = await commerce.upsertProduct(
          {
            sku,
            name,
            description,
            acceptableUse: 'Verified legitimate goods only.',
            active: true,
          },
          ctx
        );

        // Upsert standard variant
        await db.query(
          `INSERT INTO product_variants (product_id, sku, name, price_minor, currency, stock, delivery_config, active)
           VALUES ($1, $2, $3, $4, $5, $6, '{}', true)
           ON CONFLICT (sku) DO UPDATE
           SET price_minor = excluded.price_minor, stock = excluded.stock, active = true`,
          [prod.id, `${sku}_std`, `${name} Standard`, priceMinor, currency, stock ?? null]
        );

        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'PRODUCT ADDED',
              body:
                `Product **${name}** created successfully!\n\n` +
                `> SKU: \`${sku}\`\n` +
                `> Price: **${formatMoney(priceMinor, currency)}**\n` +
                `> Stock: **${stock !== null ? stock : 'Unlimited'}**`,
              footer: 'Product is now live in the storefront (/sales).',
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'ERROR', body: `Failed to add product: ${err.message}` })],
        });
      }
    }

    if (sub === 'stock') {
      const sku = interaction.options.getString('sku', true);
      const quantity = interaction.options.getInteger('quantity', true);

      const res = await db.query(
        `UPDATE product_variants SET stock = $1, updated_at = now()
         WHERE (sku = $2 OR sku = $3) AND product_id IN (SELECT id FROM products WHERE guild_id = $4)
         RETURNING sku, name, stock`,
        [quantity, sku, `${sku}_std`, interaction.guildId]
      );

      if (!res.rowCount) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NOT FOUND', body: `No variant found matching SKU \`${sku}\`.` })],
        });
      }

      const row = res.rows[0];
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'STOCK UPDATED',
            body: `Stock for **${row.name}** (\`${row.sku}\`) updated to **${row.stock}**.`,
          }),
        ],
      });
    }

    if (sub === 'remove') {
      const sku = interaction.options.getString('sku', true);
      const res = await db.query(
        `UPDATE products SET active = false, updated_at = now() WHERE sku = $1 AND guild_id = $2 RETURNING name`,
        [sku, interaction.guildId]
      );

      if (!res.rowCount) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NOT FOUND', body: `No product found with SKU \`${sku}\`.` })],
        });
      }

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'PRODUCT DEACTIVATED',
            body: `Product **${res.rows[0].name}** (\`${sku}\`) was deactivated and removed from storefront.`,
          }),
        ],
      });
    }
  },
};
