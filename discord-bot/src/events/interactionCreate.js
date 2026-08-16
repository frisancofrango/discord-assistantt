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
  formatMoney,
  THEME,
} from '../ui/theme.js';
import { consume } from '../lib/pending.js';
import { logAction, fail } from '../lib/moderation.js';
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
      // Add to cart and immediately open checkout prompt
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

        // Debit wallet and fulfill order
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
        // Decrement variant stock
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

        // Update order status
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
