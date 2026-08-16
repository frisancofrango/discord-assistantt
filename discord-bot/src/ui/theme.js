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
 * Loop Components V2 Design System.
 * Clean, bold, striking, minimal, and high-conversion.
 */
export const V2 = MessageFlags.IsComponentsV2;

/**
 * Loop E-Commerce Custom Emojis & Badges
 */
export const LOOP_EMOJIS = {
  carteira: '<:carteira:1538085596306739290>',
  carrinho: '<:carrinho2:1538430002528391168>',
  voltar: { id: '1538427387321262161', name: 'voltar' },
  adicionar: '<:adicionar:1538434663024955512>',
  remover: '<:remover:1538436943849857064>',
  transferir: '<:transferir:1538434643513315410>',
  saque: '<:saque2:1538437590963855390>',
  deposito: '<:deposito2:1538437576484982865>',
  cupom: { id: '1538396391758499911', name: 'Cupomm' },
  termos: { id: '1538396315967561809', name: 'termos' },
  caminhao: { id: '1538396353674092624', name: 'caminhao' },
  lapis: { id: '1538396334556455012', name: 'lapis' },
  escudo: '<:Escudo:1538390421825392650>',
  loopw: '<:loopw:1538009805736640602>',
  depositoIcon: { id: '1538436564609138738', name: 'deposito' },
  adicionarIcon: { id: '1538434663024955512', name: 'adicionar' },
  transferirIcon: { id: '1538434643513315410', name: 'transferir' },
  sacarIcon: { id: '1538434614748778578', name: 'sacar' },
};

export const CERTIFIED_FOOTER = `${LOOP_EMOJIS.escudo}  **Ambiente Seguro**                                     Processado pela  **${LOOP_EMOJIS.loopw}  Loop ©**`;

/** A markdown text component. */
export const text = (content) =>
  new TextDisplayBuilder().setContent(content);

/** A thin divider. */
export const divider = (big = false) =>
  new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

/** Invisible spacer for clean padding. */
export const spacer = (big = false) =>
  new SeparatorBuilder()
    .setDivider(false)
    .setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

/** Convenience button builders */
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

/**
 * Format currency minor units to human string (e.g. 900 BRL -> R$ 9,00).
 */
export function formatMoney(amountMinor, currency = 'BRL') {
  const cur = (currency || 'BRL').toUpperCase();
  const val = (Number(amountMinor || 0) / 100).toFixed(2).replace('.', ',');
  if (cur === 'BRL') return `R$ ${val}`;
  if (cur === 'USD') return `$${(Number(amountMinor || 0) / 100).toFixed(2)}`;
  if (cur === 'EUR') return `€${val}`;
  return `${val} ${cur}`;
}

/**
 * Build a clean, minimal panel.
 */
export function panel({ title, subtitle, body, footer, buttons } = {}) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  if (title) {
    c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.loopw}   **${title.toUpperCase()}**`));
    c.addSeparatorComponents(spacer(false));
  }

  if (subtitle) {
    c.addTextDisplayComponents(text(`-# ${subtitle}`));
    c.addSeparatorComponents(spacer(false));
  }

  if (body) {
    c.addTextDisplayComponents(text(body));
  }

  if (buttons?.length) {
    c.addSeparatorComponents(spacer(false));
    for (let i = 0; i < buttons.length; i += 5) {
      const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
      c.addActionRowComponents(row);
    }
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(footer ? `-# ${footer}` : CERTIFIED_FOOTER));
  return c;
}

/** Quick single-line status notice */
export function notice({ title, body, footer } = {}) {
  return panel({ title, body, footer });
}

/**
 * Build the Storefront panel from database products.
 */
export function storefrontPanel({ products = [], cartItemCount = 0, currency = 'BRL' }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.carrinho}   **LOJA & CATÁLOGO OFICIAL**`));
  c.addSeparatorComponents(spacer(false));

  if (!products.length) {
    c.addTextDisplayComponents(text(
      `> ### **Catálogo de Produtos**\n` +
      `> *Nenhum produto disponível no momento.*\n` +
      `> Cadastre novos itens utilizando \`/product criar\`.`
    ));
    c.addSeparatorComponents(spacer(false));
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button.neutral('wallet:view', '💳 Minha Carteira'),
        button.neutral('ranking:view', '🏆 Top Clientes')
      )
    );
    c.addSeparatorComponents(divider(false));
    c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
    return c;
  }

  const buttons = [];
  products.forEach((p) => {
    const v = p.variants?.[0];
    const priceStr = v ? formatMoney(v.priceMinor, v.currency || currency) : 'Consulte';
    const stockStr = v && v.stock !== null ? `Estoque: \`${v.availableStock ?? v.stock}\`` : `Estoque: \`∞\``;

    c.addTextDisplayComponents(text(
      `> ### **${p.name}**                      \`💚\`   **${priceStr}**\n` +
      `> ${p.description || 'Produto digital verificado com entrega imediata.'}\n` +
      `> <:caminhao:1538396353674092624> **Entrega Automática** · ${stockStr}`
    ));
    c.addSeparatorComponents(spacer(false));

    if (v) {
      buttons.push(button.primary(`buy:${v.id}`, `Comprar ${p.name}`));
      buttons.push(button.neutral(`cart:add:${v.id}`, `🛒 + Carrinho`));
    }
  });

  buttons.push(button.neutral('cart:view', `🛒 Carrinho (${cartItemCount})`));
  buttons.push(button.neutral('wallet:view', '💳 Minha Carteira'));

  for (let i = 0; i < buttons.length; i += 5) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
  return c;
}

/**
 * Build the Cart panel matching exact high-conversion Brazilian reference architecture.
 */
export function cartPanel({ cart = {}, items = [], subtotalMinor = 0, originalSubtotalMinor = 0, discountPercent = 0, couponCode = null, currency = 'BRL' }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  // Top Header Row
  c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.carrinho}   **CARRINHO**`));
  c.addSeparatorComponents(spacer(false));

  const totalStr = formatMoney(subtotalMinor, currency);
  const origStr = originalSubtotalMinor && originalSubtotalMinor > subtotalMinor ? `   ~~${formatMoney(originalSubtotalMinor, currency)}~~` : '';
  const discountLabel = discountPercent > 0 ? `                           \`${discountPercent}%\`   de   Desconto` : '';

  if (!items.length) {
    c.addTextDisplayComponents(text(
      `> ### **Subtotal**\n` +
      `> ### **\`R$ 0,00\`**\n\n` +
      `> *Seu carrinho está vazio no momento.*\n` +
      `> Navegue pelo catálogo para adicionar produtos.`
    ));
    c.addSeparatorComponents(spacer(false));
    c.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        button.primary('store:view', '🛍️ Ver Loja'),
        button.neutral('wallet:view', '💳 Minha Carteira')
      )
    );
    c.addSeparatorComponents(divider(false));
    c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
    return c;
  }

  // 1. Subtotal & Pricing Card
  c.addTextDisplayComponents(text(
    `> ### **Subtotal**${discountLabel}\n` +
    `> ### **\`${totalStr}\`**${origStr}`
  ));

  c.addSeparatorComponents(spacer(false));
  const payBtn = button.primary(`checkout:prompt:${cart.id || 'cart'}`, 'Pagar');
  const cupomBtn = new ButtonBuilder().setCustomId(`cart:coupon_modal:${cart.id || 'cart'}`).setLabel('Cupom').setStyle(ButtonStyle.Secondary).setEmoji(LOOP_EMOJIS.cupom);
  const termosBtn = new ButtonBuilder().setCustomId('cart:terms').setLabel('Termos').setStyle(ButtonStyle.Secondary).setEmoji(LOOP_EMOJIS.termos);

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(payBtn, cupomBtn, termosBtn)
  );

  c.addSeparatorComponents(divider(false));

  // 2. Entrega & Items Card
  c.addTextDisplayComponents(text(`### Entrega`));
  c.addSeparatorComponents(spacer(false));

  items.forEach((it) => {
    const itemPrice = formatMoney(it.priceMinor || it.unit_price_minor, currency);
    const varName = it.variantName || it.variant_name || 'Mega Fan';
    const period = it.period || 'Anual';
    const prodName = it.productName || it.name || 'Crunchyroll';

    c.addTextDisplayComponents(text(
      `> ### \`${it.quantity}x\`   ${prodName}\n` +
      `> **Valor   \`${itemPrice}\`**\n` +
      `> **Assinatura   \`${varName}\`**\n` +
      `> **Período   \`${period}\`**\n`
    ));
  });

  // Coupon row if applied
  if (couponCode) {
    c.addSeparatorComponents(divider(true));
    c.addTextDisplayComponents(text(
      `> ### Cupom\n` +
      `> **\`${couponCode.toUpperCase()}\`   Aplicado**`
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
  c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
  return c;
}

/**
 * Build the Wallet panel matching exact high-conversion Brazilian reference architecture.
 */
export function walletPanel({ wallet = {}, transactions = [], currency = 'BRL', cashbackPercent = 2 }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  // Top Header Row
  c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.carteira}   **CARTEIRA**`));
  c.addSeparatorComponents(spacer(false));

  const available = formatMoney(wallet.availableMinor || 0, wallet.currency || currency);

  // 1. Saldo Card
  c.addTextDisplayComponents(text(
    `> ### **Saldo**                      \`💚\`   **CASHBACK**   de   \`${cashbackPercent}%\`\n` +
    `> ### **\`${available}\`**`
  ));

  c.addSeparatorComponents(spacer(false));
  const depBtn = new ButtonBuilder().setCustomId('wallet:deposit').setLabel('Depositar').setStyle(ButtonStyle.Secondary).setEmoji(LOOP_EMOJIS.adicionarIcon);
  const transBtn = new ButtonBuilder().setCustomId('wallet:transfer').setLabel('Transferir').setStyle(ButtonStyle.Secondary).setEmoji(LOOP_EMOJIS.transferirIcon);
  const sacBtn = new ButtonBuilder().setCustomId('wallet:withdraw').setLabel('Sacar').setStyle(ButtonStyle.Success).setEmoji(LOOP_EMOJIS.sacarIcon);
  const resgBtn = new ButtonBuilder().setCustomId('wallet:redeem_modal').setLabel('Resgatar').setStyle(ButtonStyle.Secondary).setEmoji(LOOP_EMOJIS.cupom);

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(depBtn, transBtn, sacBtn, resgBtn)
  );

  c.addSeparatorComponents(divider(false));

  // 2. Extrato Card
  if (transactions.length) {
    const txLines = transactions.slice(0, 4).map((t) => {
      const isCredit = t.amountMinor >= 0;
      const icon = isCredit ? LOOP_EMOJIS.adicionar : LOOP_EMOJIS.remover;
      const amt = formatMoney(Math.abs(t.amountMinor), t.currency || currency);
      if (t.type === 'cashback') {
        return `> ${LOOP_EMOJIS.adicionar}   **\`${amt}\`    ${LOOP_EMOJIS.deposito}   +${cashbackPercent}%   \`💚\`**`;
      }
      if (t.type === 'coupon') {
        return `> ${LOOP_EMOJIS.adicionar}   **\`${t.metadata?.code || 'LOOP10'}\`    Resgate**`;
      }
      if (t.type === 'transfer') {
        return `> ${icon}   **\`${amt}\`    ${LOOP_EMOJIS.transferir}**`;
      }
      return `> ${icon}   **\`${amt}\`    ${isCredit ? LOOP_EMOJIS.deposito : LOOP_EMOJIS.saque}**`;
    }).join('\n');

    c.addTextDisplayComponents(text(`> ### Extrato\n${txLines}`));
  } else {
    c.addTextDisplayComponents(text(
      `> ### Extrato\n` +
      `> ${LOOP_EMOJIS.adicionar}   **\`R$ 50,00\`    ${LOOP_EMOJIS.transferir}**\n` +
      `> ${LOOP_EMOJIS.remover}   ~~R$ 350,00~~    ${LOOP_EMOJIS.saque}\n` +
      `> ${LOOP_EMOJIS.adicionar}   **\`R$ 510,00\`    ${LOOP_EMOJIS.deposito}   +2%   \`💚\`**\n` +
      `> ${LOOP_EMOJIS.adicionar}   **\`LOOP10\`    Resgate**`
    ));
  }

  c.addSeparatorComponents(spacer(false));

  // Extrato Filter Dropdown
  const filterOptions = [
    { label: 'Diário', value: 'daily', default: true },
    { label: 'Semanal', value: 'weekly' },
    { label: 'Mensal', value: 'monthly' },
    { label: 'Trimestral', value: 'quarterly' },
    { label: 'Semestral', value: 'semiannual' },
    { label: 'Anual', value: 'annual' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('wallet:tx_filter', 'Filtro de Extrato...', filterOptions))
  );

  // 3. Security Trust Footer
  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
  return c;
}

/**
 * Build the Checkout panel.
 */
export function checkoutPanel({ order, items = [], subtotalMinor = 0, currency = 'BRL', walletBalanceMinor = 0 }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  const totalStr = formatMoney(subtotalMinor, currency);
  const balanceStr = formatMoney(walletBalanceMinor, currency);
  const hasEnough = walletBalanceMinor >= subtotalMinor;

  c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.loopw}   **FINALIZAR PEDIDO**`));
  c.addSeparatorComponents(spacer(false));

  const itemList = items.map((i) => `> \`${i.quantity}x\` **${i.name}**`).join('\n') || '> `1x` **Produto Digital**';

  c.addTextDisplayComponents(text(
    `> ### **Total a Pagar**                      \`💚\`   **PEDIDO**   \`#${order.id.slice(0, 8)}\`\n` +
    `> ### **\`${totalStr}\`**\n\n` +
    `> ### Itens Inclusos\n${itemList}\n\n` +
    `> <:carteira:1538085596306739290> **Saldo em Carteira:** **\`${balanceStr}\`** ${hasEnough ? '*(Saldo suficiente)*' : '*(Saldo insuficiente)*'}`
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary(`checkout:pix:${order.id}`, '🇧🇷 Pagar com PIX Instantâneo'),
      button.neutral(`checkout:wallet:${order.id}`, '⚡ Pagar com Saldo Carteira', !hasEnough),
      button.danger(`checkout:cancel:${order.id}`, 'Cancelar Pedido')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
  return c;
}

/**
 * Build an Order Receipt panel.
 */
export function orderReceiptPanel({ order, items = [], mechanism = 'instant', verified = true, currency = 'BRL' }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.loopw}   **COMPROVANTE DE ENTREGA**`));
  c.addSeparatorComponents(spacer(false));

  const totalStr = formatMoney(order.subtotal_minor || order.subtotalMinor, order.currency || currency);
  const itemList = items.map((i) => `> \`[✓]\` \`${i.quantity}x\` **${i.name}**`).join('\n') || '> `[✓]` `1x` **Produto Entregue**';

  c.addTextDisplayComponents(text(
    `> ### **Entrega Concluída**                      \`💚\`   **STATUS**   \`ENTREGUE\`\n` +
    `> ### **\`${totalStr}\`**   ·   \`${order.provider || 'PIX / Carteira'}\`\n\n` +
    `> ### Itens Dispensados\n${itemList}\n\n` +
    `> <:caminhao:1538396353674092624> **Envio Automático:** Liquidado em <t:${Math.floor(Date.now() / 1000)}:R>`
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
  c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
  return c;
}

/**
 * Build the Roblox 70/30 Fee Calculator panel.
 */
export function robloxCalculatorPanel({ netRobux, grossPrice, feeAmount, effectiveNet, isNet = true }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.loopw}   **CALCULADORA ROBLOX 70/30**`));
  c.addSeparatorComponents(spacer(false));

  const body = isNet
    ? `> ### **Meta Líquida**                      \`💚\`   **TAXA 30%**   \`ROBLOX\`\n` +
      `> ### **\`${netRobux.toLocaleString()} R$\`**\n\n` +
      `> <:adicionar:1538434663024955512> **Preço a cadastrar:** **\`${grossPrice.toLocaleString()} Robux\`**\n` +
      `> <:remover:1538436943849857064> **Taxa retida (30%):** **\`${feeAmount.toLocaleString()} Robux\`**\n` +
      `> <:carteira:1538085596306739290> **Saldo Líquido recebido:** **\`${effectiveNet.toLocaleString()} Robux\`**`
    : `> ### **Preço do Gamepass**                      \`💚\`   **TAXA 30%**   \`ROBLOX\`\n` +
      `> ### **\`${grossPrice.toLocaleString()} Robux\`**\n\n` +
      `> <:remover:1538436943849857064> **Taxa retida (30%):** **\`${feeAmount.toLocaleString()} Robux\`**\n` +
      `> <:carteira:1538085596306739290> **Saldo Líquido recebido:** **\`${effectiveNet.toLocaleString()} Robux\`**`;

  c.addTextDisplayComponents(text(body));
  c.addSeparatorComponents(spacer(false));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('roblox:link', '🔗 Vincular Conta Roblox'),
      button.neutral('store:view', '🛍️ Ver Produtos Robux')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
  return c;
}

/**
 * Build the Help panel.
 */
export function helpMenuPanel() {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);
  c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.loopw}   **GUIA DO SISTEMA LOOP**`));
  c.addSeparatorComponents(spacer(false));

  c.addTextDisplayComponents(text(
    `> ### **Comércio & Financeiro**\n` +
    `> \`/sales\` · \`/cart\` · \`/wallet\` · \`/pix\` · \`/orders\` · \`/product\` · \`/coupon\` · \`/escrow\` · \`/license\` · \`/vendor\` · \`/storeconfig\` · \`/affiliate\` · \`/ranking\`\n\n` +
    `> ### **Moderação, Defesa & Atendimento**\n` +
    `> \`/automod\` · \`/security\` · \`/ticket\` · \`/modmail\` · \`/roles\` · \`/sticky\` · \`/warn\` · \`/timeout\` · \`/kick\` · \`/ban\` · \`/purge\` · \`/channel\` · \`/backup\` · \`/verify\`\n\n` +
    `> ### **Inteligência Artificial & Autonomia**\n` +
    `> \`/panel\` · \`/ai\` · \`/task\` · \`/loyalty\` · \`/marketing\` · \`/roblox\` · \`/server\` · \`/help\` · \`/admin\``
  ));

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:tab:commerce', '⚙️ Painel de Controle'),
      button.neutral('store:view', '🛍️ Loja'),
      button.neutral('cart:view', '🛒 Carrinho'),
      button.neutral('wallet:view', '💳 Carteira'),
      button.neutral('ranking:view', '🏆 Top Clientes')
    )
  );

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
  return c;
}

/**
 * Build root multi-category nested Operator Control Center.
 */
export function operatorDashboardPanel({ category = 'commerce', subtab = 'overview', guildId, data = {}, settings = {} }) {
  const c = new ContainerBuilder().setAccentColor(THEME.accent);

  // Category Definitions
  const categories = [
    { label: '🛍️ Vendas & Catálogo', value: 'commerce', description: 'Produtos, Estoque, Gateway PIX & Cupons', default: category === 'commerce' },
    { label: '📟 Carteira & Transações', value: 'economy', description: 'Saldos, Cofre Escrow & Cashback VIP', default: category === 'economy' },
    { label: '🤖 AI Studio & RAG', value: 'ai', description: 'Personas Neurais, Memória RAG & Prompts', default: category === 'ai' },
    { label: '🎫 Atendimento & SLA', value: 'support', description: 'Central de Tickets, Templates & Horários', default: category === 'support' },
    { label: '🛡️ Segurança & Backups', value: 'security', description: 'Anti-Nuke, AutoMod, Snapshots & OAuth2', default: category === 'security' },
  ];

  c.addTextDisplayComponents(text(`### ${LOOP_EMOJIS.loopw}   **PAINEL DE CONTROLE**`));
  c.addSeparatorComponents(spacer(false));

  // Category Selector Dropdown
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:cat_select', 'Selecionar Módulo do Painel...', categories))
  );
  c.addSeparatorComponents(spacer(false));

  // Render Category Content
  if (category === 'commerce') {
    renderCommerceCategory(c, data);
  } else if (category === 'economy') {
    renderEconomyCategory(c, data);
  } else if (category === 'ai') {
    renderAiCategory(c, data, settings);
  } else if (category === 'support') {
    renderSupportCategory(c, data);
  } else if (category === 'security') {
    renderSecurityCategory(c, data, settings);
  }

  c.addSeparatorComponents(divider(false));
  c.addTextDisplayComponents(text(CERTIFIED_FOOTER));
  return c;
}

// --------------------------------------------------------------------------
// 1. VENDAS & CATÁLOGO
// --------------------------------------------------------------------------
function renderCommerceCategory(c, { products = [], coupons = [], pixConfig = {}, commerceChannels = {}, vendorsCount = 0 }) {
  const pixStatus = pixConfig.enabled ? 'OPERACIONAL' : 'ATIVO';
  const cartCat = commerceChannels.cart_category_id ? `<#${commerceChannels.cart_category_id}>` : 'Servidor';

  c.addTextDisplayComponents(text(
    `> ### **Vendas & Catálogo**                      \`💚\`   **GATEWAY**   \`${pixStatus}\`\n` +
    `> ### **\`${products.length} Produtos\`**   ·   \`${coupons.length} Cupons\`   ·   \`${commerceChannels.currency || 'BRL'}\`\n\n` +
    `> <:adicionar:1538434663024955512> **PIX Instantâneo:** \`Ativo (0% Taxa)\`\n` +
    `> <:carrinho2:1538430002528391168> **Carrinhos Privados:** ${cartCat}\n` +
    `> <:loopw:1538009805736640602> **Lojistas Parceiros:** \`${vendorsCount}\``
  ));
  c.addSeparatorComponents(spacer(false));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:product:add_modal', '➕ Novo Produto'),
      button.neutral('panel:product:manage_stock', '📦 Estoque'),
      button.neutral('panel:coupon:create_modal', '🏷️ Novo Cupom'),
      button.neutral('store:view', '🛍️ Ver Loja')
    )
  );
}

// --------------------------------------------------------------------------
// 2. CARTEIRA & TRANSAÇÕES
// --------------------------------------------------------------------------
function renderEconomyCategory(c, { totalBalanceMinor = 0, currency = 'BRL', activeWallets = 0, totalCashbackMinor = 0 }) {
  const totalFormatted = formatMoney(totalBalanceMinor, currency);

  c.addTextDisplayComponents(text(
    `> ### **Carteira & Transações**                      \`💚\`   **LIQUIDEZ**   \`ESTÁVEL\`\n` +
    `> ### **\`${totalFormatted}\`**   ·   \`${activeWallets} Carteiras\`   ·   \`5 Tiers VIP\`\n\n` +
    `> <:adicionar:1538434663024955512> **Cashback Acumulado:** \`${formatMoney(totalCashbackMinor, currency)}\`\n` +
    `> <:transferir:1538434643513315410> **Cofre P2P (Escrow):** \`Ativo & Blindado\``
  ));
  c.addSeparatorComponents(spacer(false));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:wallet:grant_bonus', '🎁 Conceder Bônus'),
      button.neutral('ranking:view', '🏆 Top Clientes'),
      button.neutral('wallet:view', '💳 Minha Carteira')
    )
  );
}

// --------------------------------------------------------------------------
// 3. AI STUDIO & RAG
// --------------------------------------------------------------------------
function renderAiCategory(c, { knowledgeCount = 0 }, settings = {}) {
  const persona = settings.aiPersona || 'concierge';
  const autonomy = settings.aiAutonomy || 'operator';

  c.addTextDisplayComponents(text(
    `> ### **AI Studio & Autonomia**                      \`💚\`   **MODO**   \`${autonomy.toUpperCase()}\`\n` +
    `> ### **\`${persona.toUpperCase()}\`**   ·   \`${knowledgeCount} Documentos RAG\`\n\n` +
    `> <:loopw:1538009805736640602> **Memória Semântica:** \`pgvector (PostgreSQL 16)\`\n` +
    `> <:Escudo:1538390421825392650> **Governança de Autonomia:** \`Ativa\``
  ));
  c.addSeparatorComponents(spacer(false));

  const personaOptions = [
    { label: '🛎️ Concierge & Guia', value: 'concierge', description: 'Recepção amigável e suporte', default: persona === 'concierge' },
    { label: '💰 Closer de Vendas', value: 'sales_closer', description: 'Foco em conversão e ofertas', default: persona === 'sales_closer' },
    { label: '🛡️ Guardião de Segurança', value: 'security_warden', description: 'Rigor com moderação e regras', default: persona === 'security_warden' },
    { label: '⚙️ Persona Personalizada', value: 'custom', description: 'Prompt customizado pelo dono', default: persona === 'custom' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:ai:persona_select', 'Trocar Persona Ativa...', personaOptions))
  );

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:ai:ingest_modal', '📚 Ingerir RAG'),
      button.neutral('panel:ai:sandbox_modal', '🧪 Sandbox'),
      button.neutral('panel:ai:autonomy_toggle', `⚡ Modo: ${autonomy.toUpperCase()}`)
    )
  );
}

// --------------------------------------------------------------------------
// 4. ATENDIMENTO & SLA
// --------------------------------------------------------------------------
function renderSupportCategory(c, { openTickets = 0, avgSlaMinutes = 12, cannedCount = 0, hours = {} }) {
  const statusStr = hours.isOpen ? 'ONLINE' : 'FECHADO';

  c.addTextDisplayComponents(text(
    `> ### **Atendimento & SLA**                      \`💚\`   **STATUS**   \`${statusStr}\`\n` +
    `> ### **\`${openTickets} Tickets\`**   ·   \`SLA: ${avgSlaMinutes}m\`   ·   \`${cannedCount} Templates\`\n\n` +
    `> <:adicionar:1538434663024955512> **Horário de Atendimento:** ${hours.startTime || '09:00'} - ${hours.endTime || '22:00'}`
  ));
  c.addSeparatorComponents(spacer(false));

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:tickets:list_open', '📋 Fila de Tickets'),
      button.neutral('panel:tickets:add_canned', '💬 Novo Template'),
      button.neutral('panel:schedule:edit_hours', '⏰ Definir Horário'),
      button.neutral('ticket:open_prompt', '➕ Testar Ticket')
    )
  );
}

// --------------------------------------------------------------------------
// 5. SEGURANÇA & BACKUPS
// --------------------------------------------------------------------------
function renderSecurityCategory(c, { quarantinedCount = 0, totalBackups = 0, oauthMembers = 0, activeTokens = 0, linkedCount = 0 }, settings = {}) {
  const shield = settings.antiRaidLevel || 'standard';

  c.addTextDisplayComponents(text(
    `> ### **Segurança & Defesa**                      \`💚\`   **ESCUDO**   \`${shield.toUpperCase()}\`\n` +
    `> ### **\`${quarantinedCount} Quarentenas\`**   ·   \`${totalBackups} Backups\`   ·   \`${oauthMembers} OAuth2\`\n\n` +
    `> <:Escudo:1538390421825392650> **Proteção Anti-Nuke:** \`Monitoramento 24/7\`\n` +
    `> <:loopw:1538009805736640602> **Roblox Sync:** \`${linkedCount} Vinculados\``
  ));
  c.addSeparatorComponents(spacer(false));

  const shieldOptions = [
    { label: '🟢 Relaxado', value: 'relaxed', description: 'Baixa fricção para servidores casuais', default: shield === 'relaxed' },
    { label: '🟡 Padrão Corporativo', value: 'standard', description: 'Proteção equilibrada e captcha', default: shield === 'standard' },
    { label: '🟠 Fortaleza', value: 'fortress', description: 'Anti-raid rigoroso para grandes comunidades', default: shield === 'fortress' },
    { label: '🔴 Lockdown', value: 'lockdown', description: 'Bloqueio total de novas entradas', default: shield === 'lockdown' },
  ];

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(select.string('panel:security:shield_select', 'Ajustar Nível Anti-Raid...', shieldOptions))
  );

  c.addSeparatorComponents(spacer(false));
  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button.primary('panel:backup:create_modal', '📸 Snapshot'),
      button.neutral('panel:backup:list', '📋 Backups'),
      button.neutral('panel:security:quarantine_view', '🚨 Incidentes'),
      button.neutral('panel:roblox:calc:custom', '🎮 Roblox 70/30')
    )
  );
}
