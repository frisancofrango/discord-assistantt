import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, notice, V2, storefrontPanel } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Operate Loop native server systems.')
    .addSubcommand((s) =>
      s
        .setName('store')
        .setDescription('Open the server digital storefront.')
    )
    .addSubcommand((s) =>
      s
        .setName('ticket')
        .setDescription('Open a customer support ticket.')
        .addStringOption((o) =>
          o.setName('subject').setDescription('Ticket subject').setRequired(true).setMaxLength(200)
        )
        .addStringOption((o) =>
          o.setName('category').setDescription('Configured category').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s.setName('verify').setDescription('Start verification challenge.')
    )
    .addSubcommand((s) =>
      s
        .setName('marketing-optout')
        .setDescription('Opt out of marketing communications.')
        .addStringOption((o) =>
          o.setName('purpose').setDescription('Consent purpose').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s.setName('analytics').setDescription('Show privacy-aware 30-day analytics summary.')
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) {
      return interaction.reply({ content: 'Native systems are unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'store') {
      const products = await native.commerce.listProducts(interaction.guildId);
      const cart = await native.commerce.getCart(interaction.guildId, interaction.user.id).catch(() => ({ items: [] }));
      const cartCount = cart.items?.reduce((s, i) => s + i.quantity, 0) || 0;

      return interaction.reply({
        flags: V2,
        components: [storefrontPanel({ products, cartItemCount: cartCount })],
      });
    }

    if (sub === 'ticket') {
      const subject = interaction.options.getString('subject', true);
      const categoryKey = interaction.options.getString('category') || 'general';
      const row = await native.tickets.create(
        {
          idempotencyKey: `interaction:${interaction.id}`,
          memberId: interaction.user.id,
          categoryKey,
          subject,
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: `TICKET #${row.sequence}`,
            body: `**${row.subject}**\nStatus: \`${row.status.toUpperCase()}\``,
            buttons: [button.neutral(`ticket:close:${row.id}`, 'Close Ticket')],
            footer: 'Loop Support',
          }),
        ],
      });
    }

    if (sub === 'verify') {
      const row = await native.verification.begin(
        {
          idempotencyKey: `interaction:${interaction.id}`,
          memberId: interaction.user.id,
          riskScore: 0,
          joinedAt: interaction.member?.joinedAt?.toISOString(),
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'VERIFICATION',
            body:
              row.status === 'pending_rules'
                ? 'Review and accept the server rules to continue.'
                : `Status: \`${row.status}\``,
            buttons: row.status === 'pending_rules' ? [button.primary(`verify:rules:${row.id}`, 'Accept Rules')] : [],
          }),
        ],
      });
    }

    if (sub === 'marketing-optout') {
      const purpose = interaction.options.getString('purpose', true);
      const row = await native.marketing.consent(
        {
          memberId: interaction.user.id,
          purpose,
          status: 'opted_out',
          source: 'member_command',
        },
        ctx
      );

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'OPTED OUT',
            body: `Marketing consent for **${row.purpose}** has been disabled.`,
          }),
        ],
      });
    }

    if (sub === 'analytics') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'Manage Server permission is required.', ephemeral: true });
      }

      const s = await native.analytics.summary(interaction.guildId);
      const body =
        Object.entries(s.events)
          .map(([k, v]) => `> **${k}** — ${v.count} event(s)`)
          .join('\n') || 'No events recorded in this 30-day period.';

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'SERVER ANALYTICS',
            body,
            footer: 'Aggregated, privacy-aware 30-day metric view.',
          }),
        ],
      });
    }
  },
};
