import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
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

/** Select menu builders */
export const select = {
  string: (customId, placeholder, options = [], minValues = 1, maxValues = 1) =>
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(minValues)
      .setMaxValues(maxValues)
      .addOptions(
        options.map((o) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(o.label)
            .setValue(o.value)
            .setDescription(o.description || '')
            .setDefault(Boolean(o.default))
            .setEmoji(o.emoji || undefined)
        )
      ),
  user: (customId, placeholder, minValues = 1, maxValues = 1) =>
    new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(minValues)
      .setMaxValues(maxValues),
  role: (customId, placeholder, minValues = 1, maxValues = 1) =>
    new RoleSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(minValues)
      .setMaxValues(maxValues),
  channel: (customId, placeholder, minValues = 1, maxValues = 1) =>
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(minValues)
      .setMaxValues(maxValues),
};

/** Quick single-line status panel (for confirmations / results). */
export function notice({ title, body, footer } = {}) {
  return panel({ title, body, footer });
}

/**
 * Format currency minor units to human string (e.g. 900 USD -> $9.00).
 */
export function formatMoney(amountMinor, currency = 'USD') {
  const cur = (currency || 'USD').toUpperCase();
  const val = (Number(amountMinor || 0) / 100).toFixed(2);
  if (cur === 'USD') return `$${val}`;
  if (cur === 'BRL') return `R$ ${val}`;
  if (cur === 'EUR') return `€${val}`;
  return `${val} ${cur}`;
}

/**
 * Render visual ASCII progress bar.
 */
export function renderAsciiBar(value, max, length = 12) {
  if (!max || max <= 0) return '`[░░░░░░░░░░░░] 0%`';
  const ratio = Math.min(1, Math.max(0, value / max));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = Math.round(ratio * 100);
  return `\`[${bar}] ${percent}%\``;
}

/**
 * Render sparkline trend visual.
 */
export function renderAsciiSparkline(values = []) {
  if (!values.length) return '`─ ─ ─ ─ ─`';
  const chars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const line = values
    .map((v) => {
      const idx = Math.min(chars.length - 1, Math.floor(((v - min) / range) * (chars.length - 1)));
      return chars[idx];
    })
    .join('');
  return `\`${line}\``;
}

// --------------------------------------------------------------------------
// STANDARDIZED DOMAIN PANELS (Storefront, Cart, Wallet, Checkout, Receipts)
// --------------------------------------------------------------------------

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
    `> \`/panel\` — Full visual multi-tab operator control center\n` +
    `> \`/product\` — Manage catalog products, variants, pricing & stock\n` +
    `> \`/ai\` — AI Studio assistant, persona, and knowledge management\n` +
    `> \`/admin\` — Inspect system health, budget, approvals, policies & memory`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:tab:commerce', '⚙️ Open Control Panel'),
      button.neutral('store:view', '🛍️ Store'),
      button.neutral('cart:view', '🛒 Cart'),
      button.neutral('wallet:view', '💳 Wallet')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Pure monochrome Components V2 interface.'));
  return c;
}

// --------------------------------------------------------------------------
// ADVANCED OPERATOR CONTROL PANELS (Multi-Tab Interactive Dashboard)
// --------------------------------------------------------------------------

/**
 * Build root multi-tab Operator Control Panel.
 */
export function operatorDashboardPanel({ tab = 'commerce', guildId, data = {}, settings = {} }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  c.addTextDisplayComponents(text('# AZURE OPERATOR CONTROL CENTER'));
  c.addTextDisplayComponents(text('-# Real-time visual server management, commerce, neural AI & support hub.'));
  c.addSeparatorComponents(divider(false));

  // Navigation Dropdown (10 Dedicated Operating Tabs)
  const navOptions = [
    { label: '🛍️ Commerce & Catalog', value: 'commerce', description: 'Catalog, live inventory, keypool & coupons', default: tab === 'commerce' },
    { label: '💳 Digital Wallet & Ledger', value: 'wallet', description: 'Member balances, bonuses, affiliate earnings', default: tab === 'wallet' },
    { label: '🏆 Buyer Loyalty & Cashback', value: 'loyalty', description: 'VIP tiers, spend progression & leaderboard', default: tab === 'loyalty' },
    { label: '🤖 Autonomous AI Studio', value: 'ai', description: 'Personas, knowledge ingestion, prompt sandbox & autonomy', default: tab === 'ai' },
    { label: '🎫 Support & Ticket Desk', value: 'tickets', description: 'Live ticket queue, SLA metrics, canned responses & transcripts', default: tab === 'tickets' },
    { label: '⏰ Operating Hours & Schedules', value: 'schedules', description: 'Support shifts, office hours & channel night-mode locks', default: tab === 'schedules' },
    { label: '📣 Marketing & Flash Drops', value: 'marketing', description: 'Broadcast campaigns, flash drops & review incentives', default: tab === 'marketing' },
    { label: '🛡️ Security Fortress', value: 'security', description: 'Anti-nuke rate limiters, whitelist & emergency lockdown', default: tab === 'security' },
    { label: '🔄 Server & Member Backups', value: 'backups', description: 'Server snapshots, 1-click restore & OAuth2 member migration', default: tab === 'backups' },
    { label: '🎮 Roblox Matrix', value: 'roblox', description: '70/30 fee calculator, gamepass sync & user lookup', default: tab === 'roblox' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:nav', 'Navigate Console Tabs...', navOptions))
  );
  c.addSeparatorComponents(divider(false));

  // Tab Content
  if (tab === 'commerce') {
    appendCommerceTab(c, data);
  } else if (tab === 'wallet') {
    appendWalletTab(c, data);
  } else if (tab === 'loyalty') {
    appendLoyaltyTab(c, data);
  } else if (tab === 'ai') {
    appendAiTab(c, data, settings);
  } else if (tab === 'tickets') {
    appendTicketsTab(c, data);
  } else if (tab === 'schedules') {
    appendSchedulesTab(c, data);
  } else if (tab === 'marketing') {
    appendMarketingTab(c, data);
  } else if (tab === 'security') {
    appendSecurityTab(c, data, settings);
  } else if (tab === 'backups') {
    appendBackupsTab(c, data);
  } else if (tab === 'roblox') {
    appendRobloxTab(c, data);
  } else if (tab === 'analytics') {
    appendAnalyticsTab(c, data);
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(`-# Azure OS v1.2.0 · Authenticated Operator Console · Server ID: \`${guildId}\``));
  return c;
}

function appendCommerceTab(c, { products = [], coupons = [], totalRevenueMinor = 0 }) {
  c.addTextDisplayComponents(text(`## 🛍️ Commerce & Catalog Manager\nTotal Catalog Products: **${products.length}** | Active Coupons: **${coupons.length}**`));
  c.addSeparatorComponents(spacer(false));

  if (products.length) {
    const list = products.slice(0, 4).map((p) => {
      const v = p.variants?.[0];
      const stock = v?.stock !== null ? `Stock: **${v.availableStock ?? v.stock}**` : 'Stock: **∞**';
      const price = v ? formatMoney(v.priceMinor, v.currency) : 'N/A';
      return `> **${p.name}** (\`${p.sku}\`) — **${price}** (${stock})`;
    }).join('\n');
    c.addTextDisplayComponents(text(`### Active Catalog Items\n${list}`));
  } else {
    c.addTextDisplayComponents(text('No products found in the catalog.'));
  }

  const buttons = [
    button.primary('panel:product:add_modal', '➕ Add Product'),
    button.neutral('panel:product:manage_stock', '📦 Adjust Stock'),
    button.neutral('panel:coupon:create_modal', '🏷️ Create Coupon'),
    button.neutral('store:view', '👁️ Preview Store'),
  ];

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendWalletTab(c, { totalBalanceMinor = 0, currency = 'USD', activeWallets = 0 }) {
  const totalFormatted = formatMoney(totalBalanceMinor, currency);
  c.addTextDisplayComponents(text(
    `## 💳 Digital Wallet & Economy\n` +
    `Total Escrow Liquidity: **${totalFormatted}**\n` +
    `Active Wallet Holders: **${activeWallets}**`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `### Member Wallet Operations\n` +
    `Select a user below to inspect their balance, audit transactions, or grant bonuses:`
  ));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.user('panel:wallet_inspect_user', 'Select member to inspect wallet...'))
  );

  const buttons = [
    button.primary('panel:wallet:grant_bonus', '🎁 Grant Balance Bonus'),
    button.neutral('wallet:view', '💳 My Wallet'),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendLoyaltyTab(c, { topBuyerCount = 0, totalCashbackMinor = 0 }) {
  c.addTextDisplayComponents(text(
    `## 🏆 Buyer Loyalty & VIP Cashback\n` +
    `Tier System: **5 Active Tiers** (Bronze 1% ${THEME.glyph.arrow} Obsidian 10%)\n` +
    `Total Distributed Cashback: **${formatMoney(totalCashbackMinor, 'USD')}**`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `### Loyalty Progression Rules\n` +
    `> 🥉 **Bronze** ($10+ spend) ${THEME.glyph.arrow} **1%** Cashback\n` +
    `> 🥈 **Silver** ($50+ spend) ${THEME.glyph.arrow} **2%** Cashback\n` +
    `> 🥇 **Gold** ($150+ spend) ${THEME.glyph.arrow} **4%** Cashback\n` +
    `> 💎 **Diamond** ($500+ spend) ${THEME.glyph.arrow} **7%** Cashback\n` +
    `> 👑 **Obsidian** ($1,000+ spend) ${THEME.glyph.arrow} **10%** Cashback`
  ));

  const buttons = [
    button.primary('panel:loyalty:view_board', '🥇 Top Buyer Leaderboard'),
    button.neutral('loyalty:status', '👤 My Loyalty Status'),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendSchedulesTab(c, { hours = {}, lockedChannelsCount = 0 }) {
  const statusStr = hours.isOpen ? '🟢 **ONLINE & OPEN**' : '🔴 **CLOSED (OUT OF OFFICE)**';
  const daysStr = hours.days ? hours.days.map((d) => d.toUpperCase()).join(', ') : 'MON - SUN';

  c.addTextDisplayComponents(text(
    `## ⏰ Operating Hours & Channel Shifts\n` +
    `Current Shift Status: ${statusStr}\n` +
    `Shift Working Hours: **${hours.startTime || '09:00'} — ${hours.endTime || '22:00'} ${hours.timezone || 'UTC'}**\n` +
    `Operational Days: **${daysStr}**`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `### Support Availability Notice\n` +
    `> *"${hours.outOfOfficeMessage || 'Staff offline. Please leave message.'}"*`
  ));

  const buttons = [
    button.primary('panel:schedule:edit_hours', '⚙️ Set Shift Hours Modal'),
    button.neutral('channel:hours', '👁️ View Member Schedule Notice'),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendMarketingTab(c, { dropsCount = 0, reviewsCount = 0 }) {
  c.addTextDisplayComponents(text(
    `## 📣 Marketing, Flash Drops & Reviews\n` +
    `Active Flash Drops: **${dropsCount}** | Verified Customer Reviews: **${reviewsCount}**`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `### Growth & Engagement Campaigns\n` +
    `Launch time-limited product countdowns or inspect customer feedback:`
  ));

  const buttons = [
    button.primary('panel:marketing:create_drop', '⚡ Create Flash Drop'),
    button.neutral('marketing:drops_list', '📋 View Active Drops'),
    button.neutral('marketing:reviews', '⭐ Customer Reviews'),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendAiTab(c, { knowledgeCount = 0 }, settings = {}) {
  const persona = settings.aiPersona || 'concierge';
  const autonomy = settings.aiAutonomy || 'operator';

  c.addTextDisplayComponents(text(
    `## 🤖 Autonomous AI Studio\n` +
    `Active Persona: **${persona.toUpperCase()}** | Autonomy Mode: **${autonomy.toUpperCase()}**\n` +
    `Ingested Knowledge Nodes: **${knowledgeCount}** embedded in vector memory`
  ));
  c.addSeparatorComponents(spacer(false));

  // Persona Switcher
  const personaOptions = [
    { label: '🛎️ Concierge & Guide', value: 'concierge', description: 'Helpful, warm, clear server guide', default: persona === 'concierge' },
    { label: '💰 Commerce & Sales Closer', value: 'sales_closer', description: 'High-converting deal & pricing expert', default: persona === 'sales_closer' },
    { label: '🛡️ Security Warden', value: 'security_warden', description: 'Strict anti-raid and rule guardian', default: persona === 'security_warden' },
    { label: '⚙️ Custom Persona', value: 'custom', description: 'User-configured custom system prompt', default: persona === 'custom' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:ai:persona_select', 'Switch AI Persona...', personaOptions))
  );

  const buttons = [
    button.primary('panel:ai:ingest_modal', '📚 Ingest Knowledge (RAG)'),
    button.neutral('panel:ai:sandbox_modal', '🧪 AI Prompt Sandbox'),
    button.neutral('panel:ai:autonomy_toggle', `⚡ Mode: ${autonomy.toUpperCase()}`),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendTicketsTab(c, { openTickets = 0, avgSlaMinutes = 12, cannedCount = 0 }) {
  c.addTextDisplayComponents(text(
    `## 🎫 Support Command Desk\n` +
    `Open Tickets: **${openTickets}** | Average Resolution SLA: **${avgSlaMinutes}m**\n` +
    `Canned Quick-Replies: **${cannedCount}**`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `### Staff Operations\n` +
    `Manage open tickets, configure automatic canned replies, or reassign tickets:`
  ));

  const buttons = [
    button.primary('panel:tickets:list_open', '📋 View Live Queue'),
    button.neutral('panel:tickets:add_canned', '💬 Add Canned Response'),
    button.neutral('ticket:open_prompt', '➕ Test New Ticket'),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendSecurityTab(c, { quarantinedCount = 0 }, settings = {}) {
  const shield = settings.antiRaidLevel || 'standard';
  const captcha = settings.verificationMode || 'math_captcha';

  c.addTextDisplayComponents(text(
    `## 🛡️ Security & Anti-Raid Fortress\n` +
    `Shield Level: **${shield.toUpperCase()}** | Captcha Type: **${captcha.toUpperCase()}**\n` +
    `Quarantined Suspicious Accounts: **${quarantinedCount}**`
  ));
  c.addSeparatorComponents(spacer(false));

  // Shield Level Selector
  const shieldOptions = [
    { label: '🟢 Relaxed', value: 'relaxed', description: 'Low friction for casual public servers', default: shield === 'relaxed' },
    { label: '🟡 Standard', value: 'standard', description: 'Balanced rate limiting and arithmetic captcha', default: shield === 'standard' },
    { label: '🟠 Fortress', value: 'fortress', description: 'Strict account age checks, aggressive anti-raid', default: shield === 'fortress' },
    { label: '🔴 Emergency Lockdown', value: 'lockdown', description: 'Halt all non-verified joins immediately', default: shield === 'lockdown' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:security:shield_select', 'Set Anti-Raid Shield Level...', shieldOptions))
  );

  const buttons = [
    button.primary('panel:security:quarantine_view', '🚨 Quarantine Log'),
    button.neutral('verify:rules:demo', '🧪 Test Verification'),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendBackupsTab(c, { totalBackups = 0, oauthMembers = 0, activeTokens = 0 }) {
  c.addTextDisplayComponents(text(
    `## 🔄 Server & Member Backup Engine\n` +
    `Saved Template Backups: **${totalBackups}**\n` +
    `OAuth2 Backed-up Members: **${oauthMembers}** (${activeTokens} active tokens)`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `### Disaster Recovery Operations\n` +
    `Create full server JSON snapshots or view OAuth2 member restore statistics:`
  ));

  const buttons = [
    button.primary('panel:backup:create_modal', '📸 Take Server Snapshot'),
    button.neutral('panel:backup:list', '📋 List Saved Backups'),
    button.neutral('panel:backup:oauth_stats', '👥 OAuth Member Stats'),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendRobloxTab(c, { linkedCount = 0 }) {
  c.addTextDisplayComponents(text(
    `## 🎮 Roblox Commerce & 70/30 Matrix\n` +
    `Linked Discord-to-Roblox Members: **${linkedCount}**\n` +
    `Official Fee Formula: Gross = ⌈Net / 0.7⌉ (30% Marketplace Tax)`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `### Interactive 70/30 Steppers\n` +
    `Quickly test target Robux pricing breakdowns:`
  ));

  const buttons = [
    button.primary('panel:roblox:calc:100', '100 R$'),
    button.primary('panel:roblox:calc:500', '500 R$'),
    button.primary('panel:roblox:calc:1000', '1,000 R$'),
    button.neutral('panel:roblox:calc:custom', '🔢 Custom Calculation'),
    button.neutral('roblox:link', '🔗 Link Account'),
  ];
  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
}

function appendAnalyticsTab(c, { revenueTrend = [12, 18, 25, 30, 45, 60, 85], totalOrders = 24, conversionRate = 78 }) {
  const sparkline = renderAsciiSparkline(revenueTrend);
  const conversionBar = renderAsciiBar(conversionRate, 100, 10);

  c.addTextDisplayComponents(text(
    `## 📊 Growth, Revenue & Intelligence\n\n` +
    `> **7-Day Revenue Velocity:** ${sparkline}\n` +
    `> **Checkout Conversion:** ${conversionBar}\n` +
    `> **Completed Orders:** **${totalOrders}**\n` +
    `> **Payment Ingress:** Webhooks Online (Stripe, PIX, Wallet)`
  ));
}
