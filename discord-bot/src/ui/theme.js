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
        options.map((o) => {
          const opt = new StringSelectMenuOptionBuilder()
            .setLabel(o.label)
            .setValue(o.value)
            .setDescription(o.description || '')
            .setDefault(Boolean(o.default));
          if (o.emoji) opt.setEmoji(o.emoji);
          return opt;
        })
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
  c.addTextDisplayComponents(text('-# Complete operating manual & 37 slash command reference.'));
  c.addSeparatorComponents(divider(false));

  c.addTextDisplayComponents(text(
    `### 🇧🇷 Brazilian Commerce & PIX Engine\n` +
    `> \`/pix\` — Manage instant BCB PIX Copia e Cola & QR Code gateway\n` +
    `> \`/storeconfig\` — Configure cart category, review channel & default currency\n` +
    `> \`/vendor\` — Multi-seller partner registration & automated split payouts\n` +
    `> \`/ranking\` — Live top customer spenders leaderboard with VIP medals\n` +
    `> \`/sales\` — Open dynamic storefront with live stock inventory\n` +
    `> \`/cart\` — Shopping cart management & stock reservations\n` +
    `> \`/wallet\` — Digital wallet balance, deposits, withdrawals & P2P transfers\n` +
    `> \`/orders\` — Customer purchase history & verified cryptographic receipts\n` +
    `> \`/coupon\` — Promo discount codes & minimum purchase limits\n` +
    `> \`/escrow\` — P2P safe trade rooms with escrow vault & arbitration\n` +
    `> \`/license\` — Digital license serial pool & automated key dispenser\n` +
    `> \`/affiliate\` — Referral links & commission rewards tracking\n\n` +
    `### 🛡️ Moderation, Defense & AutoMod\n` +
    `> \`/automod\` — Anti-spam velocity, invite link blocking & word filters\n` +
    `> \`/sticky\` — Floating rules message pinned to channel bottom\n` +
    `> \`/roles\` — Self-service interactive button & select role menus\n` +
    `> \`/modmail\` — Private member-to-staff DM relay & forum tickets\n` +
    `> \`/security\` — Anti-nuke velocity guardian, whitelist & lockdown\n` +
    `> \`/warn\` — Formal member warning logger with DM notice\n` +
    `> \`/timeout\` — Temporary member timeout enforcement\n` +
    `> \`/kick\` & \`/ban\` — Policy-audited member removal & logging\n` +
    `> \`/purge\` — Bulk channel message cleanup\n\n` +
    `### ⏰ Operations, Marketing & AI Hub\n` +
    `> \`/panel\` — Visual 11-tab Operator Control Center\n` +
    `> \`/channel\` — Shift working hours, out-of-office banners & night-mode locks\n` +
    `> \`/loyalty\` — VIP cashback tiers (1% - 10%) & reward progress\n` +
    `> \`/marketing\` — Time-limited flash drops with countdowns & review incentives\n` +
    `> \`/backup\` — Server template snapshots & OAuth2 member restore\n` +
    `> \`/roblox\` — 70/30 marketplace tax calculator & Roblox account link\n` +
    `> \`/ticket\` — Customer support desk & cryptographic transcripts\n` +
    `> \`/verify\` — Arithmetic captcha gateway for anti-bot protection\n` +
    `> \`/ai\` — Autonomous AI Studio (Personas, RAG Learn, Prompt Sandbox)\n` +
    `> \`/admin\` — System health, autonomy budget & policies\n` +
    `> \`/task\` — Multi-step autonomous agent goal runner`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:tab:commerce', '⚙️ Open Control Panel'),
      button.neutral('store:view', '🛍️ Store'),
      button.neutral('cart:view', '🛒 Cart'),
      button.neutral('wallet:view', '💳 Wallet'),
      button.neutral('ranking:view', '🏆 Top Spenders')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Pure monochrome Components V2 interface · 37 active slash commands.'));
  return c;
}

// --------------------------------------------------------------------------
// ADVANCED OPERATOR CONTROL PANELS (5-Category Nested Architecture)
// --------------------------------------------------------------------------

/**
 * Build root multi-category nested Operator Control Center.
 */
export function operatorDashboardPanel({ category = 'commerce', subtab = 'overview', guildId, data = {}, settings = {} }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  // Category Definitions
  const categories = [
    { label: '🛍️ Vendas & Loja Brasil', value: 'commerce', description: 'Catálogo, Estoque, Gateway PIX, Carrinhos Privados & Cupons', default: category === 'commerce' },
    { label: '💳 Economia & Transações', value: 'economy', description: 'Carteiras Digitais, Vault Escrow, Cashback VIP & Ranking', default: category === 'economy' },
    { label: '🤖 AI Studio & Autonomia', value: 'ai', description: 'Personas Neurais, Memória Vetorial RAG & Sandbox de Testes', default: category === 'ai' },
    { label: '🎫 Atendimento & Operações', value: 'support', description: 'Central de Tickets, Respostas Rápidas, Turnos & Trancas', default: category === 'support' },
    { label: '🛡️ Segurança, Defesa & Backups', value: 'security', description: 'Anti-Nuke, AutoMod, Snapshots de Servidor, OAuth2 & Roblox', default: category === 'security' },
  ];

  const currentCatObj = categories.find((cat) => cat.value === category) || categories[0];

  c.addTextDisplayComponents(text(`# CONSOLE AZURE › ${currentCatObj.label.toUpperCase()}`));
  c.addTextDisplayComponents(text(`-# Painel visual de controle corporativo · Servidor: \`${guildId}\``));
  c.addSeparatorComponents(divider(false));

  // Category Selector Dropdown
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:cat_select', 'Alternar Categoria Principal...', categories))
  );
  c.addSeparatorComponents(spacer(false));

  // Render Category Content
  if (category === 'commerce') {
    renderCommerceCategory(c, data, subtab);
  } else if (category === 'economy') {
    renderEconomyCategory(c, data, subtab);
  } else if (category === 'ai') {
    renderAiCategory(c, data, settings, subtab);
  } else if (category === 'support') {
    renderSupportCategory(c, data, subtab);
  } else if (category === 'security') {
    renderSecurityCategory(c, data, settings, subtab);
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(`-# Azure OS v2.0 · Arquitetura Modular Aninhada · Componentes V2 Puros`));
  return c;
}

// --------------------------------------------------------------------------
// 1. VENDAS & LOJA BRASIL CATEGORY
// --------------------------------------------------------------------------
function renderCommerceCategory(c, { products = [], coupons = [], pixConfig = {}, commerceChannels = {}, vendorsCount = 0 }, subtab) {
  const pixStatus = pixConfig.enabled ? '🟢 **PIX OPERACIONAL**' : '🔴 **PIX INATIVO**';
  const cartCat = commerceChannels.cart_category_id ? `<#${commerceChannels.cart_category_id}>` : '*Direto no Servidor*';
  const revCh = commerceChannels.reviews_channel_id ? `<#${commerceChannels.reviews_channel_id}>` : '*Desativado*';

  c.addTextDisplayComponents(text(
    `## 🛍️ Hub de Vendas, Catálogo & Gateway Brasil\n` +
    `> **Produtos Ativos:** **${products.length}** itens | **Cupons:** **${coupons.length}** ativos\n` +
    `> **Status Gateway:** ${pixStatus} | **Moeda:** \`${commerceChannels.currency || 'BRL'}\`\n` +
    `> **Canais Integrados:** Carrinhos (${cartCat}) · Avaliações (${revCh})`
  ));
  c.addSeparatorComponents(spacer(false));

  if (products.length) {
    const list = products.slice(0, 4).map((p) => {
      const v = p.variants?.[0];
      const stock = v?.stock !== null ? `Estoque: **${v.availableStock ?? v.stock}**` : 'Estoque: **∞**';
      const price = v ? formatMoney(v.priceMinor, v.currency) : 'N/A';
      return `> **${p.name}** (\`${p.sku}\`) — **${price}** (${stock})`;
    }).join('\n');
    c.addTextDisplayComponents(text(`### 📦 Itens em Destaque no Catálogo\n${list}`));
  } else {
    c.addTextDisplayComponents(text('Nenhum produto cadastrado no catálogo ainda.'));
  }

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:product:add_modal', '➕ Novo Produto'),
      button.neutral('panel:product:manage_stock', '📦 Ajustar Estoque'),
      button.neutral('panel:coupon:create_modal', '🏷️ Criar Cupom'),
      button.neutral('panel:pix:test_charge', '🪙 PIX de Teste'),
      button.neutral('store:view', '🛍️ Ver Loja')
    )
  );
}

// --------------------------------------------------------------------------
// 2. ECONOMIA & TRANSAÇÕES CATEGORY
// --------------------------------------------------------------------------
function renderEconomyCategory(c, { totalBalanceMinor = 0, currency = 'USD', activeWallets = 0, topBuyerCount = 0, totalCashbackMinor = 0 }, subtab) {
  const totalFormatted = formatMoney(totalBalanceMinor, currency);

  c.addTextDisplayComponents(text(
    `## 💳 Hub de Economia, Escrow & Fidelidade VIP\n` +
    `> **Liquidez em Custódia:** **${totalFormatted}** | **Carteiras Ativas:** **${activeWallets}**\n` +
    `> **Cashback VIP Distribuído:** **${formatMoney(totalCashbackMinor, 'USD')}**\n` +
    `> **Tiers VIP Ativos:** 5 Níveis (Bronze 1% → Obsidiana 10%)`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `### 🔍 Auditoria Rápida de Carteira de Membro\n` +
    `Selecione um usuário para auditar saldo, transações ou conceder bônus:`
  ));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.user('panel:wallet_inspect_user', 'Selecione membro para auditar carteira...'))
  );

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:wallet:grant_bonus', '🎁 Conceder Bônus de Saldo'),
      button.neutral('ranking:view', '🏆 Top Spenders Leaderboard'),
      button.neutral('wallet:view', '💳 Minha Carteira')
    )
  );
}

// --------------------------------------------------------------------------
// 3. AI STUDIO & AUTONOMIA CATEGORY
// --------------------------------------------------------------------------
function renderAiCategory(c, { knowledgeCount = 0 }, settings = {}, subtab) {
  const persona = settings.aiPersona || 'concierge';
  const autonomy = settings.aiAutonomy || 'operator';

  c.addTextDisplayComponents(text(
    `## 🤖 Hub de Inteligência Artificial & Memória Neural\n` +
    `> **Persona Ativa:** **${persona.toUpperCase()}** | **Nível de Autonomia:** **${autonomy.toUpperCase()}**\n` +
    `> **Nós de Conhecimento (RAG):** **${knowledgeCount}** documentos indexados em memória vetorial`
  ));
  c.addSeparatorComponents(spacer(false));

  const personaOptions = [
    { label: '🛎️ Concierge & Guia', value: 'concierge', description: 'Recepção amigável, clara e acolhedora', default: persona === 'concierge' },
    { label: '💰 Closer de Vendas & Negociação', value: 'sales_closer', description: 'Especialista em fechamento de pedidos e ofertas', default: persona === 'sales_closer' },
    { label: '🛡️ Guardião de Segurança', value: 'security_warden', description: 'Rigoroso com regras, anti-raid e moderação', default: persona === 'security_warden' },
    { label: '⚙️ Persona Personalizada', value: 'custom', description: 'Prompt de sistema configurado pelo operador', default: persona === 'custom' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:ai:persona_select', 'Trocar Persona da IA...', personaOptions))
  );

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:ai:ingest_modal', '📚 Ingerir Conhecimento (RAG)'),
      button.neutral('panel:ai:sandbox_modal', '🧪 Sandbox de Prompts'),
      button.neutral('panel:ai:autonomy_toggle', `⚡ Modo: ${autonomy.toUpperCase()}`)
    )
  );
}

// --------------------------------------------------------------------------
// 4. ATENDIMENTO & OPERAÇÕES CATEGORY
// --------------------------------------------------------------------------
function renderSupportCategory(c, { openTickets = 0, avgSlaMinutes = 12, cannedCount = 0, hours = {} }, subtab) {
  const statusStr = hours.isOpen ? '🟢 **ONLINE & ATENDENDO**' : '🔴 **FECHADO (FORA DO EXPEDIENTE)**';

  c.addTextDisplayComponents(text(
    `## 🎫 Hub de Atendimento, SLA & Horários de Suporte\n` +
    `> **Fila de Tickets Abertos:** **${openTickets}** | **SLA Médio de Resolução:** **${avgSlaMinutes}m**\n` +
    `> **Templates Rápidos (Canned):** **${cannedCount}** cadastrados\n` +
    `> **Status do Expediente:** ${statusStr} (${hours.startTime || '09:00'} - ${hours.endTime || '22:00'} ${hours.timezone || 'UTC'})`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:tickets:list_open', '📋 Ver Fila de Tickets'),
      button.neutral('panel:tickets:add_canned', '💬 Novo Template Rápido'),
      button.neutral('panel:schedule:edit_hours', '⏰ Definir Horário de Expediente'),
      button.neutral('ticket:open_prompt', '➕ Testar Novo Ticket')
    )
  );
}

// --------------------------------------------------------------------------
// 5. SEGURANÇA, DEFESA & BACKUPS CATEGORY
// --------------------------------------------------------------------------
function renderSecurityCategory(c, { quarantinedCount = 0, totalBackups = 0, oauthMembers = 0, activeTokens = 0, linkedCount = 0 }, settings = {}, subtab) {
  const shield = settings.antiRaidLevel || 'standard';

  c.addTextDisplayComponents(text(
    `## 🛡️ Hub de Segurança, Defesa & Recuperação\n` +
    `> **Nível Anti-Raid:** **${shield.toUpperCase()}** | **Contas em Quarentena:** **${quarantinedCount}**\n` +
    `> **Snapshots de Servidor:** **${totalBackups}** salvos | **Membros em Backup OAuth2:** **${oauthMembers}** (${activeTokens} tokens ativos)\n` +
    `> **Membros Roblox Vinculados:** **${linkedCount}** jogadores sincronizados`
  ));
  c.addSeparatorComponents(spacer(false));

  const shieldOptions = [
    { label: '🟢 Relaxado', value: 'relaxed', description: 'Baixa fricção para servidores públicos casuais', default: shield === 'relaxed' },
    { label: '🟡 Padrão Corporativo', value: 'standard', description: 'Rate limit equilibrado e captcha aritmético', default: shield === 'standard' },
    { label: '🟠 Fortaleza', value: 'fortress', description: 'Anti-raid rigoroso e verificação de idade de conta', default: shield === 'fortress' },
    { label: '🔴 Lockdown de Emergência', value: 'lockdown', description: 'Bloqueio total de novas entradas imediatas', default: shield === 'lockdown' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:security:shield_select', 'Ajustar Escudo Anti-Raid...', shieldOptions))
  );

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:backup:create_modal', '📸 Salvar Snapshot Servidor'),
      button.neutral('panel:backup:list', '📋 Listar Backups'),
      button.neutral('panel:security:quarantine_view', '🚨 Log Anti-Nuke'),
      button.neutral('panel:roblox:calc:custom', '🎮 Calculadora Roblox 70/30')
    )
  );
}
