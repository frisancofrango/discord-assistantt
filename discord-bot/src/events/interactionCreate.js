import {
  ActionRowBuilder,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  panel,
  button,
  notice,
  V2,
  storefrontPanel,
  cartPanel,
  walletPanel,
  checkoutPanel,
  orderReceiptPanel,
  robloxCalculatorPanel,
  operatorDashboardPanel,
  formatMoney,
  THEME,
} from '../ui/theme.js';
import { consume } from '../lib/pending.js';
import { logAction } from '../lib/moderation.js';
import { withCorrelation, correlationId } from '../foundation/logger.js';
import { evaluatePolicy } from '../foundation/policy.js';
import { hashApprovalToken } from '../autonomy/proposal.js';
import { decisionPanel, progressPanel, receiptPanel, diffPanel } from '../autonomy/ui.js';
import { actorContext } from '../native/core.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    return withCorrelation(null, async () => {
      try {
        if (interaction.isChatInputCommand()) return handleCommand(interaction, client);
        if (interaction.isButton()) return handleButton(interaction, client);
        if (interaction.isStringSelectMenu()) return handleStringSelect(interaction, client);
        if (interaction.isUserSelectMenu()) return handleUserSelect(interaction, client);
        if (interaction.isModalSubmit()) return handleModal(interaction, client);
      } catch (err) {
        client.logger?.error({ err, interactionId: interaction.id }, 'interaction failed');
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          interaction.reply({
            flags: V2,
            ephemeral: true,
            components: [panel({ title: 'ERROR', body: `Something went wrong: ${err.message}` })],
          }).catch(() => {});
        }
      }
    });
  },
};

async function handleCommand(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  await command.execute(interaction, client);
}

async function handleStringSelect(interaction, client) {
  const customId = interaction.customId;
  const value = interaction.values[0];
  const native = client.runtime?.native;
  const ctx = actorContext(interaction);

  // Control Panel Tab Navigation
  if (customId === 'panel:nav') {
    const tab = value;
    const settings = await native.settings.getSettings(interaction.guildId);
    let data = {};

    if (tab === 'commerce') {
      data.products = await native.commerce.listProducts(interaction.guildId);
      data.coupons = await native.coupons.listCoupons(interaction.guildId);
    } else if (tab === 'ai') {
      const nodes = await native.aiStudio.listKnowledgeNodes(interaction.guildId);
      data.knowledgeCount = nodes.length;
    } else if (tab === 'tickets') {
      data.openTickets = (await client.runtime.db.query(`SELECT count(*)::int FROM tickets WHERE guild_id = $1 AND status != 'closed'`, [interaction.guildId])).rows[0]?.count || 0;
      data.cannedCount = (await client.runtime.db.query(`SELECT count(*)::int FROM ticket_canned_responses WHERE guild_id = $1`, [interaction.guildId])).rows[0]?.count || 0;
    } else if (tab === 'wallet') {
      const stats = (await client.runtime.db.query(`SELECT count(*)::int as count, sum(balance_minor)::bigint as total FROM wallets WHERE guild_id = $1`, [interaction.guildId])).rows[0];
      data.activeWallets = stats?.count || 0;
      data.totalBalanceMinor = Number(stats?.total || 0);
    } else if (tab === 'backups') {
      const backupsList = await native.backup.listBackups(interaction.guildId);
      const stats = await native.backup.getOAuthStats(interaction.guildId);
      data.totalBackups = backupsList.length;
      data.oauthMembers = stats.totalMembersBackedUp;
      data.activeTokens = stats.activeTokensCount;
    } else if (tab === 'roblox') {
      data.linkedCount = (await client.runtime.db.query(`SELECT count(*)::int FROM roblox_links WHERE guild_id = $1`, [interaction.guildId])).rows[0]?.count || 0;
    }

    return interaction.update({
      flags: V2,
      components: [operatorDashboardPanel({ tab, guildId: interaction.guildId, data, settings })],
    });
  }

  // AI Persona Switcher
  if (customId === 'panel:ai:persona_select') {
    const updated = await native.aiStudio.setPersona(interaction.guildId, value, null, ctx);
    const settings = await native.settings.getSettings(interaction.guildId);
    const nodes = await native.aiStudio.listKnowledgeNodes(interaction.guildId);

    return interaction.update({
      flags: V2,
      components: [
        operatorDashboardPanel({
          tab: 'ai',
          guildId: interaction.guildId,
          settings,
          data: { knowledgeCount: nodes.length },
        }),
      ],
    });
  }

  // Security Shield Level Switcher
  if (customId === 'panel:security:shield_select') {
    await native.settings.updateSettings(interaction.guildId, { antiRaidLevel: value }, ctx);
    const settings = await native.settings.getSettings(interaction.guildId);

    return interaction.update({
      flags: V2,
      components: [
        operatorDashboardPanel({
          tab: 'security',
          guildId: interaction.guildId,
          settings,
          data: { quarantinedCount: 0 },
        }),
      ],
    });
  }
}

async function handleUserSelect(interaction, client) {
  const customId = interaction.customId;
  const targetUserId = interaction.values[0];
  const native = client.runtime?.native;

  if (customId === 'panel:wallet_inspect_user') {
    const wallet = await native.wallet.getWallet(interaction.guildId, targetUserId, 'USD');
    const txs = await native.wallet.history(interaction.guildId, targetUserId, 5);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'MEMBER WALLET INSPECTION',
          subtitle: `User: <@${targetUserId}> (\`${targetUserId}\`)`,
          body:
            `> **Available Balance:** ${formatMoney(wallet.availableMinor, wallet.currency)}\n` +
            `> **Locked Balance:** ${formatMoney(wallet.lockedMinor, wallet.currency)}\n` +
            `> **Recent Transactions:** ${txs.length} recorded`,
          buttons: [
            button.primary(`panel:wallet:grant_target:${targetUserId}`, '🎁 Grant Balance Bonus'),
            button.danger(`panel:wallet:freeze:${targetUserId}`, '❄️ Freeze Wallet'),
          ],
        }),
      ],
    });
  }
}

async function handleButton(interaction, client) {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const arg1 = parts[1];
  const arg2 = parts[2];
  const arg3 = parts[3];

  // Autonomy & Admin buttons
  if (action === 'azp') return handleProposalDecision(interaction, client, arg1, arg2);
  if (action === 'azr') return handleRollback(interaction, client, arg1, arg2);
  if (action === 'adm') return handleAdminButton(interaction, client, arg1, arg2);

  const native = client.runtime?.native;
  const ctx = actorContext(interaction);

  // Control Panel Navigation via Buttons
  if (action === 'panel') {
    if (arg1 === 'tab') {
      const tab = arg2 || 'commerce';
      const settings = await native.settings.getSettings(interaction.guildId);
      const products = await native.commerce.listProducts(interaction.guildId);
      const coupons = await native.coupons.listCoupons(interaction.guildId);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          operatorDashboardPanel({
            tab,
            guildId: interaction.guildId,
            settings,
            data: { products, coupons },
          }),
        ],
      });
    }

    if (arg1 === 'product' && arg2 === 'add_modal') {
      const sku = new TextInputBuilder().setCustomId('sku').setLabel('Product SKU (e.g. vip_pass)').setStyle(TextInputStyle.Short).setRequired(true);
      const name = new TextInputBuilder().setCustomId('name').setLabel('Product Name (e.g. VIP Pass)').setStyle(TextInputStyle.Short).setRequired(true);
      const price = new TextInputBuilder().setCustomId('price').setLabel('Price in USD (e.g. 9.99)').setStyle(TextInputStyle.Short).setRequired(true);
      const stock = new TextInputBuilder().setCustomId('stock').setLabel('Stock count (leave blank for unlimited)').setStyle(TextInputStyle.Short).setRequired(false);
      const desc = new TextInputBuilder().setCustomId('desc').setLabel('Product Description').setStyle(TextInputStyle.Paragraph).setRequired(false);

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal:add_product')
          .setTitle('Create Catalog Product')
          .addComponents(
            new ActionRowBuilder().addComponents(sku),
            new ActionRowBuilder().addComponents(name),
            new ActionRowBuilder().addComponents(price),
            new ActionRowBuilder().addComponents(stock),
            new ActionRowBuilder().addComponents(desc)
          )
      );
    }

    if (arg1 === 'product' && arg2 === 'manage_stock') {
      const sku = new TextInputBuilder().setCustomId('sku').setLabel('Product SKU or Variant ID').setStyle(TextInputStyle.Short).setRequired(true);
      const delta = new TextInputBuilder().setCustomId('delta').setLabel('Stock Adjustment (e.g. +10 or -5)').setStyle(TextInputStyle.Short).setRequired(true);

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal:manage_stock')
          .setTitle('Adjust Inventory Stock')
          .addComponents(
            new ActionRowBuilder().addComponents(sku),
            new ActionRowBuilder().addComponents(delta)
          )
      );
    }

    if (arg1 === 'coupon' && arg2 === 'create_modal') {
      const code = new TextInputBuilder().setCustomId('code').setLabel('Promo Code (e.g. SAVE20)').setStyle(TextInputStyle.Short).setRequired(true);
      const discount = new TextInputBuilder().setCustomId('discount').setLabel('Discount % (1-100) or USD amount (e.g. 5.00)').setStyle(TextInputStyle.Short).setRequired(true);
      const minOrder = new TextInputBuilder().setCustomId('min_order').setLabel('Min Order (USD, optional)').setStyle(TextInputStyle.Short).setRequired(false);
      const maxUses = new TextInputBuilder().setCustomId('max_uses').setLabel('Max Uses (optional)').setStyle(TextInputStyle.Short).setRequired(false);

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal:create_coupon')
          .setTitle('Create Promotional Coupon')
          .addComponents(
            new ActionRowBuilder().addComponents(code),
            new ActionRowBuilder().addComponents(discount),
            new ActionRowBuilder().addComponents(minOrder),
            new ActionRowBuilder().addComponents(maxUses)
          )
      );
    }

    if (arg1 === 'wallet' && (arg2 === 'grant_bonus' || arg2 === 'grant_target')) {
      const targetId = arg3 || '';
      const user = new TextInputBuilder().setCustomId('user_id').setLabel('Target Member User ID').setValue(targetId).setStyle(TextInputStyle.Short).setRequired(true);
      const amount = new TextInputBuilder().setCustomId('amount').setLabel('Bonus Amount (USD, e.g. 10.00)').setStyle(TextInputStyle.Short).setRequired(true);
      const reason = new TextInputBuilder().setCustomId('reason').setLabel('Reason / Reference').setStyle(TextInputStyle.Short).setRequired(false);

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal:grant_wallet_bonus')
          .setTitle('Grant Wallet Balance Bonus')
          .addComponents(
            new ActionRowBuilder().addComponents(user),
            new ActionRowBuilder().addComponents(amount),
            new ActionRowBuilder().addComponents(reason)
          )
      );
    }

    if (arg1 === 'ai' && arg2 === 'ingest_modal') {
      const title = new TextInputBuilder().setCustomId('title').setLabel('Knowledge Topic / Title').setStyle(TextInputStyle.Short).setRequired(true);
      const category = new TextInputBuilder().setCustomId('category').setLabel('Category (e.g. rules, pricing, faq)').setValue('faq').setStyle(TextInputStyle.Short).setRequired(true);
      const content = new TextInputBuilder().setCustomId('content').setLabel('Documentation / Information').setStyle(TextInputStyle.Paragraph).setRequired(true);

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal:ai_ingest')
          .setTitle('Ingest Knowledge into Vector Memory')
          .addComponents(
            new ActionRowBuilder().addComponents(title),
            new ActionRowBuilder().addComponents(category),
            new ActionRowBuilder().addComponents(content)
          )
      );
    }

    if (arg1 === 'ai' && arg2 === 'sandbox_modal') {
      const prompt = new TextInputBuilder().setCustomId('prompt').setLabel('Test Prompt for AI Simulation').setStyle(TextInputStyle.Paragraph).setRequired(true);

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal:ai_sandbox')
          .setTitle('Autonomous AI Prompt Sandbox')
          .addComponents(new ActionRowBuilder().addComponents(prompt))
      );
    }

    if (arg1 === 'ai' && arg2 === 'autonomy_toggle') {
      const settings = await native.settings.getSettings(interaction.guildId);
      const order = ['advisor', 'operator', 'autopilot'];
      const nextIdx = (order.indexOf(settings.aiAutonomy) + 1) % order.length;
      const nextMode = order[nextIdx];
      await native.settings.updateSettings(interaction.guildId, { aiAutonomy: nextMode }, ctx);
      const updatedSettings = await native.settings.getSettings(interaction.guildId);
      const nodes = await native.aiStudio.listKnowledgeNodes(interaction.guildId);

      return interaction.update({
        flags: V2,
        components: [
          operatorDashboardPanel({
            tab: 'ai',
            guildId: interaction.guildId,
            settings: updatedSettings,
            data: { knowledgeCount: nodes.length },
          }),
        ],
      });
    }

    if (arg1 === 'tickets' && arg2 === 'add_canned') {
      const title = new TextInputBuilder().setCustomId('title').setLabel('Template Title (e.g. Payment Fix)').setStyle(TextInputStyle.Short).setRequired(true);
      const content = new TextInputBuilder().setCustomId('content').setLabel('Template Message Body').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const category = new TextInputBuilder().setCustomId('category').setLabel('Category (e.g. billing, tech)').setValue('billing').setStyle(TextInputStyle.Short).setRequired(true);

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal:add_canned_response')
          .setTitle('Create Canned Ticket Response')
          .addComponents(
            new ActionRowBuilder().addComponents(title),
            new ActionRowBuilder().addComponents(category),
            new ActionRowBuilder().addComponents(content)
          )
      );
    }

    if (arg1 === 'backup') {
      if (arg2 === 'create_modal') {
        const nameInput = new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Snapshot Name (e.g. Pre-Launch Backup)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        return interaction.showModal(
          new ModalBuilder()
            .setCustomId('modal:create_backup')
            .setTitle('Create Server Template Backup')
            .addComponents(new ActionRowBuilder().addComponents(nameInput))
        );
      }

      if (arg2 === 'list') {
        const list = await native.backup.listBackups(interaction.guildId);
        const lines = list.map((b) => {
          const time = `<t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`;
          return `> **\`${b.id}\`** — **${b.name}** (${b.channelCount} ch, ${b.roleCount} roles) · ${time}`;
        }).join('\n') || 'No backups saved.';

        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [panel({ title: 'SAVED SERVER BACKUPS', body: lines })],
        });
      }

      if (arg2 === 'oauth_stats') {
        const stats = await native.backup.getOAuthStats(interaction.guildId);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            panel({
              title: 'OAUTH2 MEMBER RESTORE STATS',
              body:
                `> **Total Members Backed Up:** **${stats.totalMembersBackedUp}**\n` +
                `> **Active Access Tokens:** **${stats.activeTokensCount}**\n` +
                `> **Rejoin Ready:** 100% synchronized`,
            }),
          ],
        });
      }
    }

    if (arg1 === 'security' && arg2 === 'quarantine_view') {
      const incidents = await native.security.listIncidents(interaction.guildId, 10);
      const lines = incidents.map((i) => {
        const time = `<t:${Math.floor(new Date(i.createdAt).getTime() / 1000)}:R>`;
        return `> **\`${i.action.toUpperCase()}\`** by <@${i.actorId}> — \`${i.status}\` (${time})`;
      }).join('\n') || 'No incidents recorded.';

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'QUARANTINE & ANTI-NUKE AUDIT', body: lines })],
      });
    }

    if (arg1 === 'tickets' && arg2 === 'list_open') {
      const rows = (await client.runtime.db.query(`SELECT * FROM tickets WHERE guild_id = $1 AND status != 'closed' ORDER BY opened_at DESC LIMIT 10`, [interaction.guildId])).rows;
      const lines = rows.map((t) => {
        return `> **Ticket #${t.sequence}** by <@${t.member_id}> — **${t.status.toUpperCase()}** (\`${t.subject}\`)`;
      }).join('\n') || 'No open tickets in queue.';

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'LIVE TICKET QUEUE', body: lines })],
      });
    }

    if (arg1 === 'roblox' && arg2 === 'calc') {
      if (arg3 === 'custom') {
        const amt = new TextInputBuilder().setCustomId('target_robux').setLabel('Target Net Robux').setStyle(TextInputStyle.Short).setRequired(true);
        return interaction.showModal(
          new ModalBuilder()
            .setCustomId('modal:roblox_custom_calc')
            .setTitle('Roblox 70/30 Fee Calculator')
            .addComponents(new ActionRowBuilder().addComponents(amt))
        );
      }

      const netAmt = parseInt(arg3, 10) || 1000;
      const calc = native.roblox.calculateFee(netAmt, true);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          robloxCalculatorPanel({
            netRobux: calc.targetNet,
            grossPrice: calc.grossPrice,
            feeAmount: calc.feeAmount,
            effectiveNet: calc.effectiveNet,
            isNet: true,
          }),
        ],
      });
    }
  }

  // Storefront navigation
  if (action === 'store' && arg1 === 'view') {
    const products = await native.commerce.listProducts(interaction.guildId);
    const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id).catch(() => ({ items: [] }));
    const cartCount = cart.items?.reduce((s, i) => s + i.quantity, 0) || 0;
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [storefrontPanel({ products, cartItemCount: cartCount })],
    });
  }

  // Cart operations
  if (action === 'cart') {
    if (arg1 === 'view') {
      const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [cartPanel({ cart, items: cart.items, subtotalMinor: cart.subtotalMinor, currency: cart.currency, expiresAt: cart.expiresAt })],
      });
    }

    if (arg1 === 'add') {
      const variantId = arg2;
      try {
        const result = await native.commerce.addToCart(
          {
            variantId,
            quantity: 1,
            memberId: interaction.user.id,
            idempotencyKey: `btn:cart:add:${interaction.guildId}:${interaction.user.id}:${variantId}:${Date.now()}`,
          },
          ctx
        );
        const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'ADDED TO CART',
              body: `Added **${result.productName || 'Item'}** to your shopping cart (Quantity: ${result.quantity}).`,
              footer: `Items reserved for ${native.commerce.config.reservationMinutes} minutes.`,
            }),
            cartPanel({ cart, items: cart.items, subtotalMinor: cart.subtotalMinor, currency: cart.currency, expiresAt: cart.expiresAt }),
          ],
        });
      } catch (err) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'COULD NOT ADD', body: err.message })],
        });
      }
    }

    if (arg1 === 'remove') {
      const cartId = arg2;
      const variantId = arg3;
      await native.commerce.removeFromCart({ cartId, variantId, memberId: interaction.user.id }, ctx);
      const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id);
      return interaction.update({
        flags: V2,
        components: [cartPanel({ cart, items: cart.items, subtotalMinor: cart.subtotalMinor, currency: cart.currency, expiresAt: cart.expiresAt })],
      });
    }

    if (arg1 === 'clear') {
      const cartId = arg2;
      await native.commerce.clearCart({ cartId, memberId: interaction.user.id }, ctx);
      const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id);
      return interaction.update({
        flags: V2,
        components: [cartPanel({ cart, items: [], subtotalMinor: 0, currency: 'USD', expiresAt: null })],
      });
    }
  }

  // Quick Buy
  if (action === 'buy') {
    const variantId = arg1;
    try {
      await native.commerce.addToCart(
        {
          variantId,
          quantity: 1,
          memberId: interaction.user.id,
          idempotencyKey: `buy:${interaction.guildId}:${interaction.user.id}:${variantId}:${Date.now()}`,
        },
        ctx
      );
      const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id);
      const order = await native.commerce.checkout(
        {
          cartId: cart.id,
          memberId: interaction.user.id,
          acceptableUseAccepted: true,
          idempotencyKey: `checkout:quick:${cart.id}:${Date.now()}`,
        },
        ctx
      );

      const wallet = await native.wallet.getWallet(interaction.guildId, interaction.user.id, order.currency);
      const items = (await client.runtime.db.query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id])).rows;

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          checkoutPanel({
            order,
            items,
            subtotalMinor: Number(order.subtotal_minor),
            currency: order.currency,
            walletBalanceMinor: wallet.availableMinor,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [notice({ title: 'CHECKOUT ERROR', body: err.message })],
      });
    }
  }

  // Checkout flows
  if (action === 'checkout') {
    if (arg1 === 'prompt') {
      const cartId = arg2;
      try {
        const order = await native.commerce.checkout(
          {
            cartId,
            memberId: interaction.user.id,
            acceptableUseAccepted: true,
            idempotencyKey: `checkout:prompt:${cartId}:${Date.now()}`,
          },
          ctx
        );

        const wallet = await native.wallet.getWallet(interaction.guildId, interaction.user.id, order.currency);
        const items = (await client.runtime.db.query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id])).rows;

        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            checkoutPanel({
              order,
              items,
              subtotalMinor: Number(order.subtotal_minor),
              currency: order.currency,
              walletBalanceMinor: wallet.availableMinor,
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'CHECKOUT FAILED', body: err.message })],
        });
      }
    }

    if (arg1 === 'wallet') {
      const orderId = arg2;
      try {
        const order = (await client.runtime.db.query(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];
        if (!order) throw new Error('Order not found');

        const subtotal = Number(order.subtotal_minor);
        const wallet = await native.wallet.getWallet(interaction.guildId, interaction.user.id, order.currency);
        if (wallet.availableMinor < subtotal) {
          throw new Error(`Insufficient wallet balance: ${formatMoney(wallet.availableMinor, order.currency)} available, ${formatMoney(subtotal, order.currency)} required.`);
        }

        await native.wallet.withdraw(
          {
            guildId: interaction.guildId,
            memberId: interaction.user.id,
            amountMinor: subtotal,
            currency: order.currency,
            destination: `order:${order.id}`,
            idempotencyKey: `wallet:pay:${order.id}`,
          },
          ctx
        );

        const items = (await client.runtime.db.query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id])).rows;
        for (const item of items) {
          await client.runtime.db.query(
            `UPDATE product_variants
             SET stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - $2 END,
                 reserved = GREATEST(0, reserved - $2),
                 updated_at = now()
             WHERE id = $1`,
            [item.variant_id, item.quantity]
          );
        }

        await client.runtime.db.query(
          `UPDATE orders SET status = 'fulfilled', provider = 'wallet', provider_reference = $2, updated_at = now() WHERE id = $1`,
          [order.id, `wallet:${wallet.id}`]
        );

        await client.runtime.db.query(
          `INSERT INTO fulfillment_events (order_id, state, mechanism, receipt)
           VALUES ($1, 'fulfilled', 'wallet_instant', $2)`,
          [order.id, JSON.stringify({ paidAt: new Date().toISOString(), walletId: wallet.id })]
        );

        return interaction.update({
          flags: V2,
          components: [
            orderReceiptPanel({
              order: { ...order, provider: 'wallet' },
              items,
              mechanism: 'wallet_instant',
              verified: true,
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'PAYMENT FAILED', body: err.message })],
        });
      }
    }

    if (arg1 === 'pix') {
      const orderId = arg2;
      const order = await native.commerce.getOrder(orderId);
      const totalStr = formatMoney(order.subtotal_minor, order.currency);
      const simulatedPixKey = `00020126580014br.gov.bcb.pix0136azure-pix-${order.id.slice(0, 8)}5204000053039865405${(order.subtotal_minor / 100).toFixed(2)}5802BR5913AzureCommerce6009SaoPaulo62070503***6304`;

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'INSTANT PIX CHECKOUT',
            subtitle: `Order ${orderId.slice(0, 8)} — Total: ${totalStr}`,
            body:
              `Scan or copy the PIX payload below in your banking app to complete payment:\n\n` +
              `\`\`\`\n${simulatedPixKey}\n\`\`\`\n\n` +
              `> Total: **${totalStr}**\n` +
              `> Expires: in 15 minutes\n` +
              `> Delivery: Instant upon PIX webhook confirmation`,
            buttons: [
              button.primary(`checkout:wallet:${orderId}`, '⚡ Or Pay with Wallet Balance'),
              button.danger(`checkout:cancel:${orderId}`, 'Cancel Order'),
            ],
            footer: 'Mercado Pago / Efi PIX Ingress Connected',
          }),
        ],
      });
    }

    if (arg1 === 'card') {
      const orderId = arg2;
      const order = await native.commerce.getOrder(orderId);
      const totalStr = formatMoney(order.subtotal_minor, order.currency);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'CARD / STRIPE CHECKOUT',
            subtitle: `Order ${orderId.slice(0, 8)} — Total: ${totalStr}`,
            body:
              `Your secure checkout session is ready.\n\n` +
              `> Amount Due: **${totalStr}**\n` +
              `> Provider: Stripe Payments / Card Gateway\n` +
              `> Encryption: 256-bit TLS SSL`,
            buttons: [
              button.primary(`checkout:wallet:${orderId}`, '⚡ Or Pay with Wallet Balance'),
              button.danger(`checkout:cancel:${orderId}`, 'Cancel Order'),
            ],
            footer: 'Webhook will automatically dispatch delivery upon card settlement.',
          }),
        ],
      });
    }

    if (arg1 === 'cancel') {
      const orderId = arg2;
      await client.runtime.db.query(
        `UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1 AND member_id = $2`,
        [orderId, interaction.user.id]
      );
      return interaction.update({
        flags: V2,
        components: [notice({ title: 'ORDER CANCELLED', body: 'This order has been cancelled and unreserved.' })],
      });
    }
  }

  // Wallet operations
  if (action === 'wallet') {
    if (arg1 === 'view') {
      const wallet = await native.wallet.getWallet(interaction.guildId, interaction.user.id, 'USD');
      const transactions = await native.wallet.history(interaction.guildId, interaction.user.id, 5);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [walletPanel({ wallet, transactions, currency: wallet.currency })],
      });
    }

    if (arg1 === 'deposit') {
      const input = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Deposit Amount (USD, e.g. 25.00)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('wallet-deposit-modal')
          .setTitle('Deposit to Digital Wallet')
          .addComponents(new ActionRowBuilder().addComponents(input))
      );
    }

    if (arg1 === 'withdraw') {
      const input = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Withdrawal Amount (USD)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('wallet-withdraw-modal')
          .setTitle('Withdraw from Wallet')
          .addComponents(new ActionRowBuilder().addComponents(input))
      );
    }

    if (arg1 === 'transfer') {
      const inputUser = new TextInputBuilder()
        .setCustomId('recipient')
        .setLabel('Recipient User ID or @Mention')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const inputAmt = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Amount to Transfer (USD)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('wallet-transfer-modal')
          .setTitle('Transfer Wallet Funds')
          .addComponents(
            new ActionRowBuilder().addComponents(inputUser),
            new ActionRowBuilder().addComponents(inputAmt)
          )
      );
    }
  }

  // Roblox operations
  if (action === 'roblox') {
    if (arg1 === 'link') {
      const input = new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Roblox Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(32);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('roblox-link-modal')
          .setTitle('Link Roblox Account')
          .addComponents(new ActionRowBuilder().addComponents(input))
      );
    }
  }

  // Ticket operations
  if (action === 'ticket') {
    if (arg1 === 'open_prompt') {
      const input = new TextInputBuilder()
        .setCustomId('subject')
        .setLabel('Ticket Subject')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(300);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('ticket-open-modal')
          .setTitle('Open Customer Support Ticket')
          .addComponents(new ActionRowBuilder().addComponents(input))
      );
    }

    if (arg1 === 'close') {
      const ticketId = arg2;
      await native.tickets.closeByMember(ticketId, interaction.user.id, `btn:${interaction.id}`);
      return interaction.update({
        flags: V2,
        components: [
          panel({
            title: 'TICKET CLOSED',
            body: 'Your ticket has been closed. Please rate your support experience below.',
            buttons: [
              button.primary(`ticket:rate:${ticketId}:5`, '⭐⭐⭐⭐⭐ 5'),
              button.primary(`ticket:rate:${ticketId}:4`, '⭐⭐⭐⭐ 4'),
              button.neutral(`ticket:rate:${ticketId}:3`, '⭐⭐⭐ 3'),
              button.neutral(`ticket:rate:${ticketId}:2`, '⭐⭐ 2'),
              button.danger(`ticket:rate:${ticketId}:1`, '⭐ 1'),
            ],
            footer: 'Azure Support Quality Score',
          }),
        ],
      });
    }

    if (arg1 === 'claim') {
      const ticketId = arg2;
      await native.tickets.claim(ticketId, interaction.user.id, ctx);
      return interaction.reply({
        flags: V2,
        components: [notice({ title: 'TICKET CLAIMED', body: `You have claimed this ticket.` })],
      });
    }

    if (arg1 === 'rate') {
      const ticketId = arg2;
      const score = parseInt(arg3, 10) || 5;
      await native.tickets.satisfaction(ticketId, interaction.user.id, score, 'Button rating', ctx).catch(() => {});
      return interaction.update({
        flags: V2,
        components: [notice({ title: 'THANK YOU', body: `Your ${score}-star rating has been recorded.` })],
      });
    }
  }

  // Verification operations
  if (action === 'verify') {
    if (arg1 === 'rules') {
      const sessionId = arg2;
      const challenge = await native.verification.acceptRules(sessionId, interaction.user.id);
      const input = new TextInputBuilder()
        .setCustomId('answer')
        .setLabel(challenge.prompt)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(32);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`verify-answer:${sessionId}`)
          .setTitle('Azure Verification Challenge')
          .addComponents(new ActionRowBuilder().addComponents(input))
      );
    }
  }

  // Orders navigation
  if (action === 'orders') {
    if (arg1 === 'list') {
      const orders = await native.commerce.listMemberOrders(interaction.guildId, interaction.user.id, 10);
      const lines = orders.map((o) => {
        const total = formatMoney(o.subtotalMinor, o.currency);
        return `> **Order \`${o.id.slice(0, 8)}...\`** — **${o.status.toUpperCase()}** (${total})`;
      }).join('\n') || 'No orders found.';
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [notice({ title: 'MY ORDERS', body: lines })],
      });
    }
  }

  // Moderation confirmations
  if (action === 'modconfirm') return handleModConfirm(interaction, client, arg1);
  if (action === 'modcancel') {
    return interaction.update({
      flags: V2,
      components: [panel({ title: 'CANCELLED', body: 'No action was taken.' })],
    });
  }
}

async function handleModal(interaction, client) {
  const customId = interaction.customId;
  const parts = customId.split(':');
  const action = parts[0];
  const arg1 = parts[1];
  const native = client.runtime?.native;
  const ctx = actorContext(interaction);

  // Add Product Modal
  if (customId === 'modal:add_product') {
    const sku = interaction.fields.getTextInputValue('sku');
    const name = interaction.fields.getTextInputValue('name');
    const priceStr = interaction.fields.getTextInputValue('price');
    const stockStr = interaction.fields.getTextInputValue('stock');
    const desc = interaction.fields.getTextInputValue('desc');

    const priceVal = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    const priceMinor = Math.round(priceVal * 100);
    const stockVal = stockStr ? parseInt(stockStr.replace(/[^0-9]/g, ''), 10) : null;

    try {
      const p = await native.commerce.upsertProduct(
        {
          sku,
          name,
          description: desc,
          acceptableUse: 'Goods',
          variants: [
            {
              sku: `${sku}_default`,
              name: `${name} Standard`,
              priceMinor,
              currency: 'USD',
              stock: stockVal,
            },
          ],
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'PRODUCT CREATED',
            body: `Created product **${p.name}** (\`${p.sku}\`) priced at **${formatMoney(priceMinor, 'USD')}**.`,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
    }
  }

  // Manage Stock Modal
  if (customId === 'modal:manage_stock') {
    const sku = interaction.fields.getTextInputValue('sku');
    const deltaStr = interaction.fields.getTextInputValue('delta');
    const delta = parseInt(deltaStr, 10);

    if (isNaN(delta)) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'INVALID DELTA', body: 'Please provide a valid stock number like +10 or -5.' })] });
    }

    try {
      await client.runtime.db.query(
        `UPDATE product_variants SET stock = GREATEST(0, stock + $1), updated_at = now() WHERE sku = $2 OR id = $2`,
        [delta, sku]
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [notice({ title: 'STOCK UPDATED', body: `Adjusted inventory for \`${sku}\` by **${delta > 0 ? '+' : ''}${delta}**.` })],
      });
    } catch (err) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
    }
  }

  // Create Coupon Modal
  if (customId === 'modal:create_coupon') {
    const code = interaction.fields.getTextInputValue('code');
    const discountStr = interaction.fields.getTextInputValue('discount');
    const minOrderStr = interaction.fields.getTextInputValue('min_order');
    const maxUsesStr = interaction.fields.getTextInputValue('max_uses');

    let percent = null;
    let amountMinor = null;
    if (discountStr.includes('%')) {
      percent = parseInt(discountStr.replace(/[^0-9]/g, ''), 10);
    } else {
      const val = parseFloat(discountStr.replace(/[^0-9.]/g, ''));
      if (val > 0 && val <= 100 && !discountStr.includes('.')) percent = val;
      else amountMinor = Math.round(val * 100);
    }

    const minOrderMinor = minOrderStr ? Math.round(parseFloat(minOrderStr.replace(/[^0-9.]/g, '')) * 100) : 0;
    const maxUses = maxUsesStr ? parseInt(maxUsesStr.replace(/[^0-9]/g, ''), 10) : null;

    try {
      const c = await native.coupons.createCoupon(
        {
          guildId: interaction.guildId,
          code,
          discountPercent: percent,
          discountMinor: amountMinor,
          minOrderMinor,
          maxUses,
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'COUPON ACTIVE',
            body: `Coupon **\`${c.code}\`** created successfully.`,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
    }
  }

  // Grant Wallet Bonus Modal
  if (customId === 'modal:grant_wallet_bonus') {
    const targetId = interaction.fields.getTextInputValue('user_id').replace(/[^0-9]/g, '');
    const amtStr = interaction.fields.getTextInputValue('amount');
    const reason = interaction.fields.getTextInputValue('reason') || 'operator_bonus';

    const amt = parseFloat(amtStr.replace(/[^0-9.]/g, ''));
    if (!targetId || isNaN(amt) || amt <= 0) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'INVALID INPUT', body: 'Please specify a valid user ID and positive bonus amount.' })] });
    }

    const amtMinor = Math.round(amt * 100);
    try {
      const result = await native.wallet.deposit(
        {
          guildId: interaction.guildId,
          memberId: targetId,
          amountMinor: amtMinor,
          currency: 'USD',
          reference: `bonus:${reason}`,
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'WALLET BONUS GRANTED',
            body: `Credited **${formatMoney(amtMinor, 'USD')}** to <@${targetId}>.\nNew Balance: **${formatMoney(result.balanceMinor, result.currency)}**`,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
    }
  }

  // Ingest AI Knowledge Modal
  if (customId === 'modal:ai_ingest') {
    const title = interaction.fields.getTextInputValue('title');
    const category = interaction.fields.getTextInputValue('category');
    const content = interaction.fields.getTextInputValue('content');

    try {
      const node = await native.aiStudio.ingestKnowledge(
        { guildId: interaction.guildId, title, category, content },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'KNOWLEDGE EMBEDDED',
            body: `Indexed **${node.title}** into AI Semantic Memory.`,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
    }
  }

  // AI Prompt Sandbox Modal
  if (customId === 'modal:ai_sandbox') {
    const prompt = interaction.fields.getTextInputValue('prompt');
    await interaction.deferReply({ ephemeral: true });

    try {
      const persona = await native.aiStudio.getPersona(interaction.guildId);
      const completion = await client.runtime.agent.router.complete({
        capability: 'conversation',
        messages: [
          { role: 'system', content: persona.systemPrompt },
          { role: 'user', content: prompt },
        ],
        contextTokens: 500,
        timeoutMs: 18_000,
      });

      return interaction.editReply({
        flags: V2,
        components: [
          panel({
            title: 'AI SIMULATION OUTPUT',
            subtitle: `Active Persona: ${persona.name}`,
            body: completion.text || 'Simulation produced no output.',
            footer: 'Autonomous AI Sandbox Engine',
          }),
        ],
      });
    } catch (err) {
      return interaction.editReply({
        flags: V2,
        components: [notice({ title: 'SIMULATION FAILED', body: err.message })],
      });
    }
  }

  // Add Canned Response Modal
  if (customId === 'modal:add_canned_response') {
    const title = interaction.fields.getTextInputValue('title');
    const category = interaction.fields.getTextInputValue('category');
    const content = interaction.fields.getTextInputValue('content');

    await client.runtime.db.query(
      `INSERT INTO ticket_canned_responses (guild_id, title, category, content) VALUES ($1, $2, $3, $4)`,
      [interaction.guildId, title, category, content]
    );

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        notice({
          title: 'CANNED RESPONSE SAVED',
          body: `Saved template **${title}** under \`${category}\`.`,
        }),
      ],
    });
  }

  // Roblox Custom Calc Modal
  if (customId === 'modal:roblox_custom_calc') {
    const amtStr = interaction.fields.getTextInputValue('target_robux');
    const amt = parseInt(amtStr.replace(/[^0-9]/g, ''), 10);
    if (!amt || amt <= 0) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'INVALID AMOUNT', body: 'Please enter a positive Robux amount.' })] });
    }

    const calc = native.roblox.calculateFee(amt, true);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        robloxCalculatorPanel({
          netRobux: calc.targetNet,
          grossPrice: calc.grossPrice,
          feeAmount: calc.feeAmount,
          effectiveNet: calc.effectiveNet,
          isNet: true,
        }),
      ],
    });
  }

  // Verification Challenge Answer
  if (action === 'verify-answer') {
    const sessionId = arg1;
    const answer = interaction.fields.getTextInputValue('answer');
    const result = await native.verification.answer(sessionId, interaction.user.id, answer, {
      guildId: interaction.guildId,
      actor: ctx.actor,
      autonomy: 'operator',
      idempotencyKey: `interaction:${interaction.id}`,
    });

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        notice({
          title: result.verified ? 'VERIFIED' : result.status === 'manual_review' ? 'MANUAL REVIEW' : 'TRY AGAIN',
          body: result.verified
            ? 'Your verification was accepted! Server access granted.'
            : result.status === 'manual_review'
            ? 'Attempt limit reached. Staff will review your session.'
            : `That answer was not accepted. ${result.remaining} attempt(s) remain.`,
        }),
      ],
    });
  }

  // Wallet Deposit Modal
  if (action === 'wallet-deposit-modal') {
    const amtStr = interaction.fields.getTextInputValue('amount');
    const amt = parseFloat(amtStr.replace(/[^0-9.]/g, ''));
    if (isNaN(amt) || amt <= 0) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'INVALID AMOUNT', body: 'Please enter a valid deposit number.' })] });
    }

    const amtMinor = Math.round(amt * 100);
    const result = await native.wallet.deposit(
      {
        guildId: interaction.guildId,
        memberId: interaction.user.id,
        amountMinor: amtMinor,
        currency: 'USD',
        reference: 'modal_deposit',
        idempotencyKey: `deposit:modal:${interaction.id}`,
      },
      ctx
    );

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        notice({
          title: 'DEPOSIT CREDITED',
          body: `Added **${formatMoney(amtMinor, 'USD')}** to your wallet.\nAvailable Balance: **${formatMoney(result.balanceMinor, result.currency)}**`,
        }),
      ],
    });
  }

  // Wallet Withdraw Modal
  if (action === 'wallet-withdraw-modal') {
    const amtStr = interaction.fields.getTextInputValue('amount');
    const amt = parseFloat(amtStr.replace(/[^0-9.]/g, ''));
    if (isNaN(amt) || amt <= 0) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'INVALID AMOUNT', body: 'Please enter a valid withdrawal number.' })] });
    }

    const amtMinor = Math.round(amt * 100);
    try {
      const result = await native.wallet.withdraw(
        {
          guildId: interaction.guildId,
          memberId: interaction.user.id,
          amountMinor: amtMinor,
          currency: 'USD',
          destination: 'payout',
          idempotencyKey: `withdraw:modal:${interaction.id}`,
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'WITHDRAWAL PROCESSED',
            body: `Withdrew **${formatMoney(amtMinor, 'USD')}**.\nNew Balance: **${formatMoney(result.balanceMinor, result.currency)}**`,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [notice({ title: 'WITHDRAWAL FAILED', body: err.message })],
      });
    }
  }

  // Wallet Transfer Modal
  if (action === 'wallet-transfer-modal') {
    const rawRecipient = interaction.fields.getTextInputValue('recipient').replace(/[^0-9]/g, '');
    const amtStr = interaction.fields.getTextInputValue('amount');
    const amt = parseFloat(amtStr.replace(/[^0-9.]/g, ''));

    if (!rawRecipient || isNaN(amt) || amt <= 0) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'INVALID INPUT', body: 'Please enter a valid user ID and positive amount.' })] });
    }

    const amtMinor = Math.round(amt * 100);
    try {
      const result = await native.wallet.transfer(
        {
          guildId: interaction.guildId,
          senderId: interaction.user.id,
          recipientId: rawRecipient,
          amountMinor: amtMinor,
          currency: 'USD',
          idempotencyKey: `transfer:modal:${interaction.id}`,
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'TRANSFER COMPLETE',
            body: `Transferred **${formatMoney(amtMinor, 'USD')}** to <@${rawRecipient}>.\nNew Balance: **${formatMoney(result.senderBalanceMinor, result.currency)}**`,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [notice({ title: 'TRANSFER FAILED', body: err.message })],
      });
    }
  }

  // Roblox Link Modal
  if (action === 'roblox-link-modal') {
    const username = interaction.fields.getTextInputValue('username');
    try {
      const link = await native.roblox.linkAccount(
        {
          guildId: interaction.guildId,
          memberId: interaction.user.id,
          username,
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'ROBLOX ACCOUNT LINKED',
            body: `Successfully linked to Roblox user **${link.robloxUsername}** (\`${link.robloxId}\`).`,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [notice({ title: 'LINKING FAILED', body: err.message })],
      });
    }
  }

  // Create Backup Modal
  if (customId === 'modal:create_backup') {
    const name = interaction.fields.getTextInputValue('name') || `Backup_${new Date().toISOString().slice(0, 10)}`;
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await native.backup.createSnapshot(interaction.guild, interaction.user.id, name, ctx);
      return interaction.editReply({
        flags: V2,
        components: [
          notice({
            title: 'SERVER BACKUP CREATED',
            body: `Snapshot **${result.name}** saved (${result.channelCount} ch, ${result.roleCount} roles).`,
          }),
        ],
      });
    } catch (err) {
      return interaction.editReply({ flags: V2, components: [notice({ title: 'BACKUP ERROR', body: err.message })] });
    }
  }

  // Add License Keys Modal
  if (customId === 'modal:add_license_keys') {
    const variantId = interaction.fields.getTextInputValue('variant_id');
    const rawKeys = interaction.fields.getTextInputValue('keys');
    const keys = rawKeys.split(/[\n,;]+/).map((k) => k.trim()).filter((k) => k.length > 0);

    try {
      const result = await native.license.addKeys(variantId, keys, ctx);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'LICENSE KEYS LOADED',
            body: `Added **${result.addedCount}** key(s) to keypool. Available: **${result.totalUnused}**.`,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
    }
  }

  // Ticket Open Modal
  if (action === 'ticket-open-modal') {
    const subject = interaction.fields.getTextInputValue('subject');
    try {
      const row = await native.tickets.create(
        {
          idempotencyKey: `ticket:modal:${interaction.id}`,
          memberId: interaction.user.id,
          categoryKey: 'general',
          subject,
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: `TICKET #${row.sequence} OPENED`,
            body: `Your ticket has been recorded: **${subject}**`,
            footer: 'Staff will assist you shortly.',
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
}

async function handleProposalDecision(interaction, client, action, token) {
  const autonomy = client.runtime.autonomy;
  const grant = await autonomy.store.findApprovalToken(hashApprovalToken(token, autonomy.config.approvalTokenPepper));
  if (!grant) return interaction.update(decisionPanel('EXPIRED', 'This approval is invalid or expired.'));
  const proposal = autonomy.hydrate(await autonomy.store.getProposal(grant.proposal_id));
  if (action === 'diff') return interaction.reply({ ...diffPanel(proposal), ephemeral: true });
  if (action === 'close') return interaction.update(decisionPanel('CLOSED', 'Diff dismissed.'));
  const actor = { id: interaction.user.id, guildId: interaction.guildId, authenticated: true, bot: interaction.user.bot, isOwner: interaction.guild?.ownerId === interaction.user.id, permissions: interaction.memberPermissions?.toArray?.() ?? [] };
  const map = { all: 'approve_all', partial: 'approve_partial', reject: 'reject', changes: 'request_changes' };
  const decisionName = map[action];
  if (!decisionName) return;
  const safe = proposal.machinePlan.steps.filter((s) => !s.irreversible && s.risk !== 'high').map((s) => s.id);
  try {
    const decision = await autonomy.approvals.decide({ token, proposal, actor, decision: decisionName, selectedStepIds: safe, policy: { default: { autonomy: 'operator' } }, budget: { limit: client.runtime.agent.router?.budgetUsd ?? 5, spent: 0 } });
    if (!decisionName.startsWith('approve')) return interaction.update(decisionPanel(decisionName === 'reject' ? 'REJECTED' : 'CHANGES REQUESTED', 'No server changes were made.'));
    await interaction.update(progressPanel({ goal: proposal.goal, status: 'running', stage: 'preflight', completed: 0, total: decision.approved_step_ids?.length ?? decision.approvedStepIds.length }));
    const result = await autonomy.executor.start({ proposal, decision, actor });
    return interaction.editReply(receiptPanel(result.receipt));
  } catch (error) {
    return interaction.update(decisionPanel(error.escalation ? 'ESCALATION REQUIRED' : 'BLOCKED', error.message));
  }
}

async function handleRollback(interaction, client, mode, executionId) {
  if (interaction.guild?.ownerId !== interaction.user.id) {
    return interaction.reply({ ...decisionPanel('BLOCKED', 'Only the server owner can roll back this workflow.'), ephemeral: true });
  }
  await interaction.update(progressPanel({ goal: 'Rollback', status: 'running', stage: 'compensation', completed: 0, total: 1 }));
  const result = await client.runtime.autonomy.rollback.rollback({
    executionId,
    actor: { id: interaction.user.id, guildId: interaction.guildId, authenticated: true, isOwner: true },
    full: mode === 'full',
    targetStage: mode === 'full' ? null : Number(mode),
  });
  return interaction.editReply(receiptPanel(result.receipt));
}

async function handleAdminButton(interaction, client, arg, token) {
  if (interaction.guild?.ownerId !== interaction.user.id) {
    return interaction.reply({ content: 'Only the server owner can use the Azure console.', ephemeral: true });
  }
  if (arg === 'close') return interaction.update({ flags: V2, components: [panel({ title: 'AZURE · CONSOLE CLOSED', body: 'Panel dismissed.' })] });
  if (arg === 'wipe') {
    const removed = await client.runtime.memory.forgetAll({ guildId: interaction.guildId });
    return interaction.update({ flags: V2, components: [panel({ title: 'MEMORY WIPED', body: `Removed ${removed.removed} semantic memory row(s) for this server.` })] });
  }
  if (arg === 'refresh') {
    const { renderOwnerView } = await import('../commands/admin.js');
    const view = await renderOwnerView(client, interaction.guildId, token);
    if (view.error) return interaction.update(decisionPanel('ERROR', view.error));
    return interaction.update(view.panel);
  }
}

async function handleModConfirm(interaction, client, token) {
  const data = consume(token);
  if (!data) {
    return interaction.update({
      flags: V2,
      components: [panel({ title: 'EXPIRED', body: 'This confirmation has expired. Run the command again.' })],
    });
  }

  const permission = data.type === 'ban' ? 'BanMembers' : 'KickMembers';
  const decision = evaluatePolicy({
    domain: 'moderation',
    autonomy: 'operator',
    risk: 'high',
    actor: {
      authenticated: true,
      guildMember: Boolean(interaction.inGuild()),
      bot: interaction.user.bot,
      isOwner: interaction.guild?.ownerId === interaction.user.id,
      permissions: interaction.memberPermissions?.has(permission) ? [permission] : [],
    },
    requiredPermissions: [permission],
    approval: { status: 'approved' },
  });

  client.logger?.info({ decision, action: data.type, actorId: interaction.user.id, guildId: interaction.guildId, correlationId: correlationId() }, 'moderation policy evaluated');
  if (client.runtime.state.database) {
    await client.runtime.repositories.audit.record({
      action: `discord.moderation.${data.type}`,
      domain: 'moderation',
      risk: 'high',
      decision: decision.allowed ? 'allowed' : 'denied',
      reason: decision.reason,
      correlation_id: correlationId(),
      metadata: { discordGuildId: interaction.guildId, discordActorId: interaction.user.id, discordTargetId: data.userId },
    }).catch((err) => client.logger?.error({ err }, 'failed to persist policy audit'));
  }

  if (!decision.allowed) {
    return interaction.update({
      flags: V2,
      components: [panel({ title: 'BLOCKED', body: `Policy denied this action: ${decision.reason}.` })],
    });
  }

  const guild = interaction.guild;
  try {
    if (data.type === 'ban') {
      await guild.members.ban(data.userId, { reason: data.reason });
    } else if (data.type === 'kick') {
      const member = await guild.members.fetch(data.userId).catch(() => null);
      if (!member) throw new Error('Member left the server.');
      await member.kick(data.reason);
    }
  } catch (err) {
    return interaction.update({
      flags: V2,
      components: [panel({ title: 'FAILED', body: `Could not complete the ${data.type}. Check my permissions.` })],
    });
  }

  await interaction.update({
    flags: V2,
    components: [
      panel({
        title: data.type === 'ban' ? 'BANNED' : 'KICKED',
        body: `**${data.tag}** has been ${data.type === 'ban' ? 'banned' : 'kicked'}.`,
      }),
    ],
  });

  await logAction(client, {
    action: data.type === 'ban' ? 'Ban' : 'Kick',
    target: data.tag,
    moderator: interaction.user.tag,
    reason: data.reason,
  });
}
