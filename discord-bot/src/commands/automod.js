import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Intelligent real-time anti-phishing, invite link, and spam protection.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('rules').setDescription('Inspect active AutoMod filters and actions.')
    )
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Configure an AutoMod rule filter.')
        .addStringOption((o) =>
          o
            .setName('rule')
            .setDescription('Rule filter type')
            .setRequired(true)
            .addChoices(
              { name: 'Anti-Phishing & Scam URLs', value: 'anti_phishing' },
              { name: 'Anti-Discord Invites', value: 'anti_invites' },
              { name: 'Mass Mentions (>=5)', value: 'mass_mentions' },
              { name: 'Mass Caps Screaming', value: 'mass_caps' }
            )
        )
        .addBooleanOption((o) =>
          o.setName('enabled').setDescription('Enable or disable rule').setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('Enforcement action')
            .setRequired(true)
            .addChoices(
              { name: 'Delete Message', value: 'delete' },
              { name: 'Delete & Warn Member', value: 'delete_and_warn' },
              { name: 'Delete & 10-Minute Timeout', value: 'delete_and_timeout' },
              { name: 'Delete & Server Kick', value: 'delete_and_kick' }
            )
        )
    ),

  async execute(interaction, client) {
    const automod = client.runtime?.native?.automod;
    if (!automod) {
      return interaction.reply({ content: 'AutoMod system is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'rules') {
      const rules = await automod.getRules(interaction.guildId);
      const defaultRules = [
        { rule_type: 'anti_phishing', enabled: true, action: 'delete_and_warn' },
        { rule_type: 'anti_invites', enabled: true, action: 'delete_and_warn' },
        { rule_type: 'mass_mentions', enabled: true, action: 'delete_and_timeout' },
        { rule_type: 'mass_caps', enabled: true, action: 'delete' },
      ];

      const activeRules = rules.length ? rules : defaultRules;
      const lines = activeRules.map((r) => {
        const status = r.enabled ? '🟢 **ACTIVE**' : '🔴 **DISABLED**';
        return `> **\`${r.rule_type.toUpperCase()}\`** — ${status} (Action: \`${r.action}\`)`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'SHIELD AUTOMOD RULES',
            subtitle: 'Real-time proactive message sanitization',
            body: lines,
            buttons: [button.primary('panel:tab:security', '🛡️ Security Fortress')],
          }),
        ],
      });
    }

    if (sub === 'set') {
      const rule = interaction.options.getString('rule', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      const action = interaction.options.getString('action', true);

      try {
        const updated = await automod.setRule(interaction.guildId, rule, { enabled, action }, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            notice({
              title: 'AUTOMOD RULE UPDATED',
              body: `Rule **\`${updated.rule_type.toUpperCase()}\`** set to **${updated.enabled ? 'ENABLED' : 'DISABLED'}** with action \`${updated.action}\`.`,
            }),
          ],
        });
      } catch (err) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'ERROR', body: err.message })] });
      }
    }
  },
};
