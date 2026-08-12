import { loadConfig } from './foundation/config.js';

/** Validated runtime configuration. Legacy top-level accessors preserve command behavior. */
export const runtimeConfig = loadConfig();
export const config = Object.freeze({
  ...runtimeConfig,
  token: runtimeConfig.discord.token,
  clientId: runtimeConfig.discord.clientId,
  guildId: runtimeConfig.discord.guildId,
  modLogChannelId: runtimeConfig.discord.modLogChannelId,
});

/**
 * Monochrome theme.
 * Bold, minimal, striking — no color, no emoji clutter.
 * The accent bar is pure black; separators + bold markdown carry the design.
 */
export const THEME = {
  accent: 0x000000, // pure black accent bar for Components V2 containers
  // Small set of glyphs that read well in a monochrome layout.
  glyph: {
    bullet: '—',
    arrow: '→',
    check: '✓',
    cross: '✕',
  },
};

/**
 * Sales catalog.
 * Add / edit products here. `id` is used in button custom IDs, so keep it
 * short, lowercase, and free of the `:` character (used as a delimiter).
 */
export const PRODUCTS = [
  {
    id: 'starter',
    name: 'STARTER',
    price: '$9',
    tagline: 'Everything you need to launch.',
    perks: ['1 project', 'Community support', 'Core features'],
  },
  {
    id: 'pro',
    name: 'PRO',
    price: '$29',
    tagline: 'For teams that ship fast.',
    perks: ['Unlimited projects', 'Priority support', 'Advanced analytics'],
  },
  {
    id: 'ultra',
    name: 'ULTRA',
    price: '$99',
    tagline: 'Maximum power, zero limits.',
    perks: ['Everything in Pro', 'Dedicated manager', 'Custom integrations'],
  },
];

export const getProduct = (id) => PRODUCTS.find((p) => p.id === id) || null;
