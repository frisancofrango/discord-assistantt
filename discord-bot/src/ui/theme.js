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
export function storefrontPanel({ products = [], cartItemCount = 0, currency = 'BRL' }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# 🛍️ LOJA & CATÁLOGO OFICIAL'));
  c.addTextDisplayComponents(text('-# Produtos verificados com entrega automática e garantia oficial.'));
  c.addSeparatorComponents(divider(false));

  if (!products.length) {
    c.addTextDisplayComponents(text('> *Nenhum produto disponível no catálogo no momento.*'));
    c.addSeparatorComponents(spacer(false));
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button.neutral('wallet:view', '💳 Minha Carteira'),
        button.neutral('ranking:view', '🏆 Top Clientes')
      )
    );
    c.addSeparatorComponents(divider(false));
    c.addTextDisplayComponents(text('-# 🛡️ **Ambiente Seguro** · Processado pela **Loop ©**'));
    return c;
  }

  const buttons = [];
  products.forEach((p, idx) => {
    const v = p.variants?.[0];
    const priceStr = v ? formatMoney(v.priceMinor, v.currency || currency) : 'Consulte';
    const stockStr = v && v.stock !== null ? `\`[${v.availableStock ?? v.stock} em estoque]\`` : '`[Estoque Ilimitado]`';
    const deliveryStr = '`[🚚 Automática]`';
    const perks = p.metadata?.perks?.length
      ? '\n' + p.metadata.perks.map((pk) => `> ${THEME.glyph.check} ${pk}`).join('\n')
      : '';

    c.addTextDisplayComponents(
      text(`## ${p.name} · **\`[${priceStr}]\`**\n${p.description || 'Produto digital verificado e garantido.'}\n-# ${stockStr} · ${deliveryStr}${perks}`)
    );

    if (v) {
      buttons.push(button.primary(`buy:${v.id}`, `Comprar ${p.name}`));
      buttons.push(button.neutral(`cart:add:${v.id}`, `🛒 + Carrinho`));
    }

    if (idx < products.length - 1) {
      c.addSeparatorComponents(divider(false));
    }
  });

  // Global action bar (View Cart, Wallet)
  buttons.push(button.neutral('cart:view', `🛒 Meu Carrinho (${cartItemCount})`));
  buttons.push(button.neutral('wallet:view', '💳 Minha Carteira'));

  c.addSeparatorComponents(spacer(false));
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
    c.addActionRowComponents(row);
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# 🛡️ **Ambiente Seguro** · Processado pela **Loop ©**'));
  return c;
}

/**
 * Build the Cart panel matching exact high-conversion Brazilian reference architecture.
 */
export function cartPanel({ cart = {}, items = [], subtotalMinor = 0, originalSubtotalMinor = 0, discountPercent = 0, couponCode = null, currency = 'BRL', expiresAt, deliveryType = 'Automática' }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  // Top Title Bar
  c.addTextDisplayComponents(text('# 🛒 CARRINHO'));
  c.addSeparatorComponents(divider(false));

  const totalStr = formatMoney(subtotalMinor, currency);
  const origStr = originalSubtotalMinor && originalSubtotalMinor > subtotalMinor ? ` ~~${formatMoney(originalSubtotalMinor, currency)}~~` : '';
  const discountBadge = discountPercent > 0 ? ` \`[${discountPercent}% de Desconto]\`` : '';

  if (!items.length) {
    c.addTextDisplayComponents(text(
      `### Subtotal\n` +
      `**\`R$ 0,00\`**\n\n` +
      `*Seu carrinho está vazio no momento.*\n` +
      `Navegue pela loja para adicionar produtos.`
    ));
    c.addSeparatorComponents(spacer(false));
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button.primary('store:view', '🛍️ Ver Loja'),
        button.neutral('wallet:view', '💳 Minha Carteira')
      )
    );
    c.addSeparatorComponents(divider(false));
    c.addTextDisplayComponents(text('-# 🛡️ Ambiente Seguro · Processado pela **Loop ©**'));
    return c;
  }

  // 1. Subtotal & Pricing Card
  c.addTextDisplayComponents(text(
    `### Subtotal${discountBadge}\n` +
    `**\`${totalStr}\`**${origStr}`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary(`checkout:prompt:${cart.id || 'cart'}`, '💳 Pagar'),
      button.neutral(`cart:coupon_modal:${cart.id || 'cart'}`, '🎟️ Cupom'),
      button.neutral('cart:terms', '📄 Termos')
    )
  );

  c.addSeparatorComponents(divider(false));

  // 2. Entrega & Items Card
  const deliveryBadge = `\`[🚚 ${deliveryType}]\``;
  c.addTextDisplayComponents(text(`### Entrega ${deliveryBadge}`));

  items.forEach((it) => {
    const itemPrice = formatMoney(it.priceMinor || it.unit_price_minor, currency);
    const varName = it.variantName || it.variant_name || 'Padrão';
    const period = it.period || 'Mensal';

    c.addTextDisplayComponents(text(
      `\`${it.quantity}x\` **${it.productName || it.name || 'Produto'}**\n` +
      `> Valor \`[${itemPrice}]\` · Opção \`[${varName}]\` · Ciclo \`[${period}]\``
    ));
  });

  // Coupon row if applied
  if (couponCode) {
    c.addSeparatorComponents(spacer(false));
    c.addTextDisplayComponents(text(
      `### Cupom\n` +
      `\`[${couponCode.toUpperCase()}]\` **Aplicado com sucesso**`
    ));
  }

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.neutral(`cart:edit:${cart.id || 'cart'}`, '✏️ Editar Itens'),
      button.danger(`cart:clear:${cart.id || 'cart'}`, '🗑️ Limpar Carrinho'),
      button.neutral('store:view', '🛍️ Continuar Comprando')
    )
  );

  // 3. Security Trust Footer
  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# 🛡️ **Ambiente Seguro** · Processado pela **Loop ©**'));
  return c;
}

/**
 * Build the Wallet panel matching exact high-conversion Brazilian reference architecture.
 */
export function walletPanel({ wallet = {}, transactions = [], currency = 'BRL', cashbackPercent = 2 }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  // Top Title Bar
  c.addTextDisplayComponents(text('# 📟 CARTEIRA'));
  c.addSeparatorComponents(divider(false));

  const available = formatMoney(wallet.availableMinor || 0, wallet.currency || currency);
  const cashbackBadge = `\`[💚 CASHBACK de ${cashbackPercent}%]\``;

  // 1. Saldo Card
  c.addTextDisplayComponents(text(
    `### Saldo ${cashbackBadge}\n` +
    `**\`${available}\`**`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.neutral('wallet:deposit', '➕ Depositar'),
      button.neutral('wallet:transfer', '↔ Transferir'),
      button.primary('wallet:withdraw', '💵 Sacar'),
      button.neutral('wallet:redeem_modal', '🎟️ Resgatar')
    )
  );

  c.addSeparatorComponents(divider(false));

  // 2. Extrato Card
  c.addTextDisplayComponents(text(`### Extrato & Histórico de Movimentações`));

  if (transactions.length) {
    const txLines = transactions.slice(0, 4).map((t) => {
      const isCredit = t.amountMinor >= 0;
      const sign = isCredit ? '+' : '-';
      const arrow = isCredit ? '↓' : '↑';
      const amt = formatMoney(Math.abs(t.amountMinor), t.currency || currency);
      const perk = t.type === 'cashback' ? ` +${cashbackPercent}% 💚` : t.type === 'coupon' ? ` Resgate 🎟️` : ` ${arrow}`;
      return `> **\`${sign}\`** \`[${amt}]\` \`${t.type.toUpperCase()}\`${perk}`;
    }).join('\n');

    c.addTextDisplayComponents(text(txLines));
  } else {
    c.addTextDisplayComponents(text('> *Nenhuma movimentação registrada no extrato recente.*'));
  }

  c.addSeparatorComponents(spacer(false));

  // Extrato Filter Dropdown
  const filterOptions = [
    { label: 'Todas as Transações', value: 'all', description: 'Histórico completo consolidado', default: true },
    { label: 'Depósitos & Entradas', value: 'deposits', description: 'Recargas via PIX e transferências' },
    { label: 'Saques & Pagamentos', value: 'withdraws', description: 'Compras efetuadas e retiradas' },
    { label: 'Recompensas de Cashback', value: 'cashback', description: 'Bônus de fidelidade recebidos' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('wallet:tx_filter', 'Filtrar extrato...', filterOptions))
  );

  // 3. Security Trust Footer
  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# 🛡️ **Ambiente Seguro** · Processado pela **Loop ©**'));
  return c;
}

/**
 * Build the Checkout panel.
 */
export function checkoutPanel({ order, items = [], subtotalMinor = 0, currency = 'BRL', walletBalanceMinor = 0 }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# 💳 FINALIZAR PEDIDO'));
  c.addTextDisplayComponents(text(`-# Pedido ID: \`${order.id}\` · Ambiente Seguro Ativo`));
  c.addSeparatorComponents(divider(false));

  const totalStr = formatMoney(subtotalMinor, currency);
  const walletBalStr = formatMoney(walletBalanceMinor, currency);
  const canPayWallet = walletBalanceMinor >= subtotalMinor;

  const itemList = items.map((i) => `> \`${i.quantity}x\` **${i.name}** — **\`[${formatMoney(i.quantity * i.unit_price_minor, currency)}]\`**`).join('\n');

  c.addTextDisplayComponents(text(
    `### Itens do Pedido\n${itemList}\n\n` +
    `### Total a Pagar: **\`[${totalStr}]\`**\n` +
    `> Saldo Disponível em Carteira: **\`[${walletBalStr}]\`**`
  ));
  c.addSeparatorComponents(divider(false));

  const buttons = [];
  if (canPayWallet) {
    buttons.push(button.primary(`checkout:wallet:${order.id}`, '⚡ Pagar com Saldo'));
  } else {
    buttons.push(button.neutral('wallet:deposit', '➕ Adicionar Saldo'));
  }
  buttons.push(button.primary(`checkout:pix:${order.id}`, '🇧🇷 Pagar com PIX'));
  buttons.push(button.neutral(`checkout:card:${order.id}`, '💳 Pagar com Cartão'));
  buttons.push(button.danger(`checkout:cancel:${order.id}`, '❌ Cancelar'));

  c.addSeparatorComponents(spacer(false));
  for (let i = 0; i < buttons.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
    c.addActionRowComponents(row);
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# 🛡️ **Ambiente Seguro** · Processado pela **Loop ©**'));
  return c;
}

/**
 * Build an Order Receipt panel.
 */
export function orderReceiptPanel({ order, items = [], mechanism = 'instant', verified = true, currency = 'BRL' }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# 📜 COMPROVANTE DE ENTREGA'));
  c.addTextDisplayComponents(text(`-# Pedido Verificado: \`${order.id}\``));
  c.addSeparatorComponents(divider(false));

  const totalStr = formatMoney(order.subtotal_minor || order.subtotalMinor, order.currency || currency);
  const itemList = items.map((i) => `> \`[✓]\` \`${i.quantity}x\` **${i.name}**`).join('\n');

  c.addTextDisplayComponents(text(
    `### Status: **\`[✅ ENTREGUE COM SUCESSO]\`**\n` +
    `**Total Pago:** **\`[${totalStr}]\`** via \`${order.provider || 'PIX / Carteira'}\`\n\n` +
    `### Itens Entregues\n${itemList}\n\n` +
    `> Método de Envio: \`[🚚 Automático]\` · Data: <t:${Math.floor(Date.now() / 1000)}:F>`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('orders:list', '📜 Meus Pedidos'),
      button.neutral('store:view', '🛍️ Ver Loja'),
      button.neutral('ranking:view', '🏆 Top Clientes')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# 🛡️ **Ambiente Seguro** · Processado pela **Loop ©**'));
  return c;
}

/**
 * Build the Roblox 70/30 Fee Calculator panel.
 */
export function robloxCalculatorPanel({ netRobux, grossPrice, feeAmount, effectiveNet, isNet = true }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# 🎮 CALCULADORA ROBLOX 70/30'));
  c.addTextDisplayComponents(text('-# Discriminativo da taxa de 30% da plataforma Roblox.'));
  c.addSeparatorComponents(divider(false));

  const body = isNet
    ? `Para receber **\`[${netRobux.toLocaleString()} R$ Líquidos]\`** após a taxa de 30% do Roblox:\n\n` +
      `> Preço do Gamepass a cadastrar: **\`[${grossPrice.toLocaleString()} Robux]\`**\n` +
      `> Taxa retida pelo Roblox (30%): **\`[${feeAmount.toLocaleString()} Robux]\`**\n` +
      `> Saldo Líquido que você recebe: **\`[${effectiveNet.toLocaleString()} Robux]\`**`
    : `Se o seu Gamepass estiver listado por **\`[${grossPrice.toLocaleString()} Robux]\`**:\n\n` +
      `> Taxa retida pelo Roblox (30%): **\`[${feeAmount.toLocaleString()} Robux]\`**\n` +
      `> Saldo Líquido que você recebe: **\`[${effectiveNet.toLocaleString()} Robux]\`**`;

  c.addTextDisplayComponents(text(body));
  c.addSeparatorComponents(spacer(false));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('roblox:link', '🔗 Vincular Conta Roblox'),
      button.neutral('store:view', '🛍️ Ver Produtos Robux')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# 🛡️ **Ambiente Seguro** · Fórmula Oficial: Gross = ⌈Net / 0.7⌉'));
  return c;
}

/**
 * Build the Help panel.
 */
export function helpMenuPanel() {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text('# GUIA DO SISTEMA LOOP'));
  c.addTextDisplayComponents(text('-# Manual operacional completo & referência de 37 comandos slash.'));
  c.addSeparatorComponents(divider(false));

  c.addTextDisplayComponents(text(
    `### 🇧🇷 Comércio Brasileiro & Gateway PIX\n` +
    `> \`/pix\` — Gerenciar gateway PIX Copia e Cola & QR Code com CRC16 do BCB\n` +
    `> \`/storeconfig\` — Configurar categoria de carrinhos, canal de avaliações & moeda\n` +
    `> \`/vendor\` — Cadastro de múltiplos vendedores & split automático de pagamentos\n` +
    `> \`/ranking\` — Leaderboard em tempo real dos maiores compradores com medalhas VIP\n` +
    `> \`/sales\` — Vitrine dinâmica com estoque e botões de compra rápida\n` +
    `> \`/cart\` — Carrinho privado com reserva de estoque e cupons\n` +
    `> \`/wallet\` — Carteira digital, depósitos via PIX, saques & transferências P2P\n` +
    `> \`/orders\` — Histórico de compras com comprovantes criptografados\n` +
    `> \`/coupon\` — Cupons de desconto promocionais e limites de uso\n` +
    `> \`/escrow\` — Salas de intermediação segura P2P com cofre e arbitragem\n` +
    `> \`/license\` — Pool de seriais e dispensador automático de chaves\n` +
    `> \`/affiliate\` — Links de afiliados e comissões automáticas\n\n` +
    `### 🛡️ Moderação, Defesa & AutoMod\n` +
    `> \`/automod\` — Anti-spam de velocidade, bloqueador de convites e filtro de palavras\n` +
    `> \`/sticky\` — Mensagem de regras flutuante fixada no rodapé do canal\n` +
    `> \`/roles\` — Menus interativos de auto-atribuição de cargos via botões e select\n` +
    `> \`/modmail\` — Atendimento privado de DMs de membros via tópicos/canais da staff\n` +
    `> \`/security\` — Guardião anti-nuke, whitelist de confiança e lockdown\n` +
    `> \`/warn\` — Sistema de advertências formais com log e aviso na DM\n` +
    `> \`/timeout\` — Aplicação de castigo temporário para membros\n` +
    `> \`/kick\` & \`/ban\` — Expulsão e banimento auditados com verificação de segurança\n` +
    `> \`/purge\` — Limpeza em massa de mensagens do canal\n\n` +
    `### ⏰ Operações, Marketing & AI Studio\n` +
    `> \`/panel\` — Console do Operador com 5 categorias aninhadas\n` +
    `> \`/channel\` — Horários de expediente, avisos de fora do ar e trancas noturnas\n` +
    `> \`/loyalty\` — Tiers de cashback VIP (1% a 10%) e progresso de gastos\n` +
    `> \`/marketing\` — Flash drops com contagem regressiva e recompensas por avaliações\n` +
    `> \`/backup\` — Snapshots de servidor e restauração de membros via OAuth2\n` +
    `> \`/roblox\` — Calculadora de taxas 70/30 do marketplace e vínculo de conta\n` +
    `> \`/ticket\` — Central de suporte com transcrições criptografadas\n` +
    `> \`/verify\` — Captcha aritmético para defesa contra auto-bots\n` +
    `> \`/ai\` — AI Studio Autônomo (Personas Neurais, RAG Learn, Prompt Sandbox)\n` +
    `> \`/admin\` — Saúde do sistema, orçamento de autonomia e políticas\n` +
    `> \`/task\` — Executor autônomo de metas com DAG multi-etapas`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:tab:commerce', '⚙️ Abrir Painel de Controle'),
      button.neutral('store:view', '🛍️ Loja'),
      button.neutral('cart:view', '🛒 Carrinho'),
      button.neutral('wallet:view', '💳 Carteira'),
      button.neutral('ranking:view', '🏆 Top Clientes')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text('-# Interface Components V2 Pura · 37 comandos slash ativos.'));
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

  c.addTextDisplayComponents(text(`# CONSOLE LOOP › ${currentCatObj.label.toUpperCase()}`));
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
  c.addTextDisplayComponents(text(`-# Loop OS v2.0 · Arquitetura Modular Aninhada · Componentes V2 Puros`));
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
