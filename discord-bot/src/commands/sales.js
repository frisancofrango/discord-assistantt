import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { PRODUCTS, THEME } from '../config.js';
import { panel, button, V2, text, divider } from '../ui/theme.js';

/** Build the storefront panel from the PRODUCTS catalog. */
export function buildStorefront() {
  const c = panel({
    title: 'THE STORE',
    subtitle: 'Minimal. Bold. Built to convert.',
  });

  PRODUCTS.forEach((p, i) => {
    const perks = p.perks.map((perk) => `${THEME.glyph.check} ${perk}`).join('\n');
    c.addTextDisplayComponents(
      text(`## ${p.name} ${THEME.glyph.bullet} **${p.price}**\n${p.tagline}\n${perks}`),
    );
    c.addActionRowComponents((row) =>
      row.addComponents(button.primary(`buy:${p.id}`, `Buy ${p.name}`)),
    );
    if (i < PRODUCTS.length - 1) c.addSeparatorComponents(divider(false));
  });

  return c;
}

export default {
  data: new SlashCommandBuilder()
    .setName('sales')
    .setDescription('Post the storefront panel with buy buttons.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.reply({
      flags: V2,
      components: [buildStorefront()],
    });
  },
};
