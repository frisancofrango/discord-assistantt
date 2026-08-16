import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { THEME } from '../config.js';
export { THEME };

/**
 * Monochrome Components V2 design system.
 *
 * Every panel is a single black-accented ContainerBuilder. We lean on bold
 * markdown headings (#, ##), thin separators, and generous spacing instead of
 * color to create a clean, modern, striking look.
 *
 * IMPORTANT: any message rendered with these helpers MUST be sent with
 * `flags: MessageFlags.IsComponentsV2`. Use `V2` below when replying.
 */

export const V2 = MessageFlags.IsComponentsV2;

/** A markdown text component. */
export const text = (content) =>
  new TextDisplayBuilder().setContent(content);

/** A thin divider. `big` adds large vertical spacing for a more airy layout. */
export const divider = (big = false) =>
  new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

/** Invisible spacer (no line) for breathing room. */
export const spacer = (big = false) =>
  new SeparatorBuilder()
    .setDivider(false)
    .setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

/**
 * Build a monochrome panel.
 * @param {object} opts
 * @param {string} [opts.title]    Rendered as an H1 (`# TITLE`).
 * @param {string} [opts.subtitle] Small muted line under the title.
 * @param {string} [opts.body]     Markdown body copy.
 * @param {string} [opts.footer]   Small line at the bottom.
 * @param {import('discord.js').ButtonBuilder[]} [opts.buttons] CTA buttons.
 * @returns {ContainerBuilder}
 */
export function panel({ title, subtitle, body, footer, buttons } = {}) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  if (title) c.addTextDisplayComponents(text(`# ${title}`));
  if (subtitle) c.addTextDisplayComponents(text(`-# ${subtitle}`));
  if (title || subtitle) c.addSeparatorComponents(divider(false));

  if (body) c.addTextDisplayComponents(text(body));

  if (buttons?.length) {
    c.addSeparatorComponents(spacer(false));
    for (let i = 0; i < buttons.length; i += 5) {
      const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
      c.addActionRowComponents(row);
    }
  }

  if (footer) {
    c.addSeparatorComponents(divider(false));
    c.addTextDisplayComponents(text(`-# ${footer}`));
  }

  return c;
}

/** Convenience button builders in the monochrome style. */
export const button = {
  primary: (customId, label, disabled = false) =>
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  neutral: (customId, label, disabled = false) =>
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  danger: (customId, label, disabled = false) =>
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  link: (url, label) =>
    new ButtonBuilder()
      .setURL(url)
      .setLabel(label)
      .setStyle(ButtonStyle.Link),
};

/** Quick single-line status panel (for confirmations / results). */
export function notice({ title, body, footer } = {}) {
  return panel({ title, body, footer });
}

// --------------------------------------------------------------------------
// STANDARDIZED DOMAIN PANELS (Wallet, Cart, Storefront, Checkout, Roblox)
// --------------------------------------------------------------------------

/**
 * Format currency minor units to human string (e.g. 900 USD -> $9.00).
 */
export function formatMoney(amountMinor, currency = 'USD') {
  const cur = (currency || 'USD').toUpperCase();
  const val = (Number(amountMinor) / 100).toFixed(2);
  if (cur === 'USD') return `$${val}`;
  if (cur === 'BRL') return `R$ ${val}`;
  if (cur === 'EUR') return `€${val}`;
  return `${val} ${cur}`;
}

/**
 * Build the Storefront panel from database products.
 */
export function storefrontPanel({ products = [], cartItemCount = 0 }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# THE STORE'));
  c.addTextDisplayComponents(text('-# Minimal. Bold. High-conversion digital commerce.'));
  c.addSeparatorComponents(divider(false));

  if (!products.length) {
    c.addTextDisplayComponents(text('No products are currently available in the catalog.'));
    return c;
  }

  const buttons = [];
  products.forEach((p, idx) => {
    const v = p.variants?.[0];
    const priceStr = v ? formatMoney(v.priceMinor, v.currency) : 'Contact staff';
    const stockStr = v && v.stock !== null ? `Stock: **${v.availableStock ?? v.stock}**` : 'Stock: **Unlimited**';
    const perks = p.metadata?.perks?.length
      ? '\n' + p.metadata.perks.map((pk) => `> ${THEME.glyph.check} ${pk}`).join('\n')
      : '';

    c.addTextDisplayComponents(
      text(`## ${p.name} ${THEME.glyph.bullet} **${priceStr}**\n${p.description || 'Verified legitimate digital good.'}\n-# ${stockStr}${perks}`)
    );

    if (v) {
      buttons.push(button.primary(`buy:${v.id}`, `Buy ${p.name}`));
      buttons.push(button.neutral(`cart:add:${v.id}`, `+ Add to Cart`));
    }

    if (idx < products.length - 1) {
      c.addSeparatorComponents(divider(false));
    }
  });

  // Global action bar (View Cart, Wallet)
  buttons.push(button.neutral('cart:view', `🛒 View Cart (${cartItemCount})`));
  buttons.push(button.neutral('wallet:view', '💳 My Wallet'));

  c.addSeparatorComponents(spacer(false));
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
    c.addActionRowComponents(row);
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Instant fulfillment upon verified payment. Accepts Wallet, PIX, Card & Stripe.'));
  return c;
}

/**
 * Build the Cart panel.
 */
export function cartPanel({ cart, items = [], subtotalMinor = 0, currency = 'USD', expiresAt }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# SHOPPING CART'));

  const totalStr = formatMoney(subtotalMinor, currency);
  const expiryNote = expiresAt
    ? `Stock reserved until: <t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`
    : 'Items reserved for 15 minutes.';
  c.addTextDisplayComponents(text(`-# ${expiryNote}`));
  c.addSeparatorComponents(divider(false));

  if (!items.length) {
    c.addTextDisplayComponents(text('Your cart is currently empty.\n\nBrowse the catalog to add items.'));
    c.addSeparatorComponents(spacer(false));
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button.primary('store:view', '🛍️ Browse Store'),
        button.neutral('wallet:view', '💳 My Wallet')
      )
    );
    return c;
  }

  const lines = items.map((it) => {
    const unitPrice = formatMoney(it.priceMinor, it.currency);
    const itemTotal = formatMoney(it.totalMinor, it.currency);
    return `**${it.productName || it.variantName}** (x${it.quantity})\n> Unit: ${unitPrice} ${THEME.glyph.arrow} Total: **${itemTotal}**`;
  }).join('\n\n');

  c.addTextDisplayComponents(text(lines));
  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(`### Total: **${totalStr}**`));

  const buttons = [
    button.primary(`checkout:prompt:${cart.id}`, '💳 Proceed to Checkout'),
    button.danger(`cart:clear:${cart.id}`, '🗑️ Clear Cart'),
    button.neutral('store:view', '🛍️ Continue Shopping'),
  ];

  c.addSeparatorComponents(spacer(false));
  const row = new ActionRowBuilder().addComponents(buttons);
  c.addActionRowComponents(row);

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Transparent digital checkout with instant delivery.'));
  return c;
}

/**
 * Build the Wallet panel.
 */
export function walletPanel({ wallet, transactions = [], currency = 'USD' }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# DIGITAL WALLET'));
  c.addTextDisplayComponents(text('-# Instant balance, deposits, withdrawals and buyer ledger.'));
  c.addSeparatorComponents(divider(false));

  const available = formatMoney(wallet.availableMinor, wallet.currency || currency);
  const locked = wallet.lockedMinor > 0 ? ` (Locked in pending orders: ${formatMoney(wallet.lockedMinor, wallet.currency)})` : '';

  c.addTextDisplayComponents(text(`## Available Balance: **${available}**${locked}`));
  c.addSeparatorComponents(divider(false));

  if (transactions.length) {
    c.addTextDisplayComponents(text('### Recent Transactions'));
    const txLines = transactions.slice(0, 5).map((t) => {
      const sign = t.amountMinor >= 0 ? '+' : '';
      const amtStr = `${sign}${formatMoney(t.amountMinor, t.currency)}`;
      const timeStr = `<t:${Math.floor(new Date(t.createdAt).getTime() / 1000)}:R>`;
      return `\`${t.type.toUpperCase()}\` **${amtStr}** — ${timeStr}`;
    }).join('\n');
    c.addTextDisplayComponents(text(txLines));
  } else {
    c.addTextDisplayComponents(text('No recent transactions on record.'));
  }

  const buttons = [
    button.primary('wallet:deposit', '➕ Deposit Funds'),
    button.neutral('wallet:withdraw', '➖ Withdraw'),
    button.neutral('wallet:transfer', '💸 Transfer'),
    button.neutral('cart:view', '🛒 View Cart'),
  ];

  c.addSeparatorComponents(spacer(false));
  const row = new ActionRowBuilder().addComponents(buttons);
  c.addActionRowComponents(row);

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Wallet funds can be used for instant 1-click checkout across the server.'));
  return c;
}

/**
 * Build the Checkout panel.
 */
export function checkoutPanel({ order, items = [], subtotalMinor = 0, currency = 'USD', walletBalanceMinor = 0 }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# ORDER CHECKOUT'));
  c.addTextDisplayComponents(text(`-# Order ID: \`${order.id}\``));
  c.addSeparatorComponents(divider(false));

  const totalStr = formatMoney(subtotalMinor, currency);
  const walletBalStr = formatMoney(walletBalanceMinor, currency);
  const canPayWallet = walletBalanceMinor >= subtotalMinor;

  const itemList = items.map((i) => `> ${THEME.glyph.bullet} **${i.name}** (x${i.quantity}) — ${formatMoney(i.quantity * i.unit_price_minor, currency)}`).join('\n');

  c.addTextDisplayComponents(text(`### Items in Order\n${itemList}\n\n### Total Due: **${totalStr}**\nYour Wallet Balance: **${walletBalStr}**`));
  c.addSeparatorComponents(divider(false));

  const buttons = [];
  if (canPayWallet) {
    buttons.push(button.primary(`checkout:wallet:${order.id}`, '⚡ Pay with Wallet Balance'));
  } else {
    buttons.push(button.neutral('wallet:deposit', '➕ Add Funds to Wallet'));
  }
  buttons.push(button.primary(`checkout:pix:${order.id}`, '🇧🇷 Pay with Instant PIX'));
  buttons.push(button.neutral(`checkout:card:${order.id}`, '💳 Pay with Card / Stripe'));
  buttons.push(button.danger(`checkout:cancel:${order.id}`, 'Cancel Order'));

  c.addSeparatorComponents(spacer(false));
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
    c.addActionRowComponents(row);
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# By proceeding, you accept the server acceptable-use digital commerce terms.'));
  return c;
}

/**
 * Build an Order Receipt panel.
 */
export function orderReceiptPanel({ order, items = [], mechanism = 'instant', verified = true }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# ORDER RECEIPT'));
  c.addTextDisplayComponents(text(`-# Verified Order: \`${order.id}\``));
  c.addSeparatorComponents(divider(false));

  const totalStr = formatMoney(order.subtotal_minor || order.subtotalMinor, order.currency);
  const itemList = items.map((i) => `> ${THEME.glyph.check} **${i.name}** (x${i.quantity})`).join('\n');

  c.addTextDisplayComponents(text(
    `### Status: **FULFILLED & VERIFIED**\n` +
    `**Total Paid:** ${totalStr} via \`${order.provider || 'wallet'}\`\n\n` +
    `### Delivered Items\n${itemList}\n\n` +
    `Delivery Method: \`${mechanism}\`\n` +
    `Timestamp: <t:${Math.floor(Date.now() / 1000)}:F>`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('orders:list', '📜 My Orders'),
      button.neutral('store:view', '🛍️ Browse Store')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Thank you for your purchase! Open a ticket if you need assistance.'));
  return c;
}

/**
 * Build the Roblox 70/30 Fee Calculator panel.
 */
export function robloxCalculatorPanel({ netRobux, grossPrice, feeAmount, effectiveNet, isNet = true }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# ROBLOX 70/30 FEE CALCULATOR'));
  c.addTextDisplayComponents(text('-# Official Roblox marketplace 30% tax breakdown.'));
  c.addSeparatorComponents(divider(false));

  const body = isNet
    ? `To receive **${netRobux.toLocaleString()} Robux** net after Roblox takes 30%:\n\n` +
      `> Set Gamepass / Asset Price: **${grossPrice.toLocaleString()} Robux**\n` +
      `> Roblox Platform Cut (30%): **${feeAmount.toLocaleString()} Robux**\n` +
      `> You Receive: **${effectiveNet.toLocaleString()} Robux**`
    : `If your Gamepass is listed at **${grossPrice.toLocaleString()} Robux**:\n\n` +
      `> Roblox Platform Cut (30%): **${feeAmount.toLocaleString()} Robux**\n` +
      `> You Receive: **${effectiveNet.toLocaleString()} Robux**`;

  c.addTextDisplayComponents(text(body));
  c.addSeparatorComponents(spacer(false));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('roblox:link', '🔗 Link Roblox Account'),
      button.neutral('store:view', '🛍️ View Robux Products')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Formula: Gross = ⌈Net / 0.7⌉. Exact calculation verified against Roblox mechanics.'));
  return c;
}

/**
 * Build the Help panel.
 */
export function helpMenuPanel() {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# AZURE SYSTEM GUIDE'));
  c.addTextDisplayComponents(text('-# Complete operating manual & slash command reference.'));
  c.addSeparatorComponents(divider(false));

  c.addTextDisplayComponents(text(
    `### 🛒 Commerce & Store\n` +
    `> \`/sales\` or \`/store\` — Open the dynamic storefront with live inventory\n` +
    `> \`/cart\` — Manage active shopping cart & stock reservations\n` +
    `> \`/wallet\` — Inspect digital wallet balance, deposit, withdraw & transfer\n` +
    `> \`/orders\` — View your purchase history & verified receipts\n` +
    `> \`/roblox\` — 70/30 marketplace tax calculator & account linking\n\n` +
    `### 🎫 Support & Community\n` +
    `> \`/ticket open\` — Open a private customer support ticket\n` +
    `> \`/ticket close\` — Close ticket & generate cryptographic transcript\n` +
    `> \`/verify\` — Complete arithmetic captcha to access the server\n` +
    `> \`/announce\` — Send a styled Components V2 server broadcast\n\n` +
    `### 🛡️ Moderation\n` +
    `> \`/warn\` — Issue an official warning with DM notification\n` +
    `> \`/timeout\` — Apply or lift temporary member timeout\n` +
    `> \`/kick\` — Safely remove member with policy audit\n` +
    `> \`/ban\` — Permanently ban member with reason log\n` +
    `> \`/purge\` — Bulk clean recent channel messages\n\n` +
    `### ⚙️ Operator Console\n` +
    `> \`/product\` — Manage catalog products, variants, pricing & stock\n` +
    `> \`/fulfill\` — Manually fulfill or verify a customer order\n` +
    `> \`/admin\` — Inspect system health, budget, approvals, policies & memory\n` +
    `> \`/task\` — Execute server autonomy workflows`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('store:view', '🛍️ Store'),
      button.neutral('cart:view', '🛒 Cart'),
      button.neutral('wallet:view', '💳 Wallet'),
      button.neutral('ticket:open_prompt', '🎫 Support Ticket')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Pure monochrome Components V2 interface.'));
  return c;
}
