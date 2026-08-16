import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Anti-Nuke, emergency lockdown, and administrator whitelist controls.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('lockdown')
        .setDescription('Toggle emergency server freeze.')
        .addBooleanOption((o) =>
          o.setName('enable').setDescription('Set lockdown active').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Reason for lockdown').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('whitelist')
        .setDescription('Manage trusted administrator anti-nuke whitelist.')
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('Action')
            .setRequired(true)
            .addChoices(
              { name: '➕ Add Co-Owner', value: 'add' },
              { name: '➖ Remove', value: 'remove' },
              { name: '📋 List', value: 'list' }
            )
        )
        .addUserOption((o) =>
          o.setName('user').setDescription('Target user').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s.setName('incidents').setDescription('View recent security and anti-nuke incident logs.')
    )
    .addSubcommand((s) =>
      s.setName('status').setDescription('Inspect active Anti-Nuke and fortress protections.')
    ),

  async execute(interaction, client) {
    const security = client.runtime?.native?.security;
    const settingsSvc = client.runtime?.native?.settings;
    if (!security) {
      return interaction.reply({ content: 'Security service is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'lockdown') {
      const enable = interaction.options.getBoolean('enable', true);
      const reason = interaction.options.getString('reason') || 'Manual Administrator Emergency Trigger';

      await interaction.deferReply({ ephemeral: true });
      try {
        await security.setLockdown(interaction.guild, enable, reason, ctx);
        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: enable ? '🚨 EMERGENCY LOCKDOWN ACTIVE' : '🟢 SERVER LOCKDOWN LIFTED',
              body: enable
                ? `The server has been locked down. Non-admin messaging and invites are frozen.\n\n**Reason:** ${reason}`
                : 'Server permissions have been restored to normal operation.',
            }),
          ],
        });
      } catch (err) {
        return interaction.editReply({
          flags: V2,
          components: [notice({ title: 'LOCKDOWN ERROR', body: err.message })],
        });
      }
    }

    if (sub === 'whitelist') {
      const action = interaction.options.getString('action', true);
      const targetUser = interaction.options.getUser('user');

      if (action === 'list') {
        const list = await security.listWhitelist(interaction.guildId);
        const lines = list.map((w) => `> <@${w.userId}> (\`${w.userId}\`) — Role: \`${w.role}\``).join('\n') || 'No whitelisted users.';
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [
            panel({
              title: 'TRUSTED ADMINISTRATOR WHITELIST',
              subtitle: 'Anti-Nuke Bypass List',
              body: lines,
            }),
          ],
        });
      }

      if (!targetUser) {
        return interaction.reply({ flags: V2, ephemeral: true, components: [notice({ title: 'USER REQUIRED', body: 'Please specify a target user.' })] });
      }

      if (action === 'add') {
        await security.addWhitelist(interaction.guildId, targetUser.id, 'co_owner', interaction.user.id, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'WHITELISTED', body: `Added <@${targetUser.id}> to the trusted anti-nuke whitelist.` })],
        });
      }

      if (action === 'remove') {
        await security.removeWhitelist(interaction.guildId, targetUser.id, ctx);
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'REMOVED', body: `Removed <@${targetUser.id}> from the whitelist.` })],
        });
      }
    }

    if (sub === 'incidents') {
      const list = await security.listIncidents(interaction.guildId, 10);
      if (!list.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'SECURITY INCIDENTS', body: 'No security incidents or anti-nuke triggers recorded.' })],
        });
      }

      const lines = list.map((i) => {
        const time = `<t:${Math.floor(new Date(i.createdAt).getTime() / 1000)}:R>`;
        return `> **\`${i.action.toUpperCase()}\`** by <@${i.actorId}> — Status: \`${i.status}\` (${time})`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'SECURITY INCIDENT AUDIT', body: lines })],
      });
    }

    if (sub === 'status') {
      const s = await settingsSvc.getSettings(interaction.guildId);
      const whitelist = await security.listWhitelist(interaction.guildId);

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'SECURITY & ANTI-NUKE GUARDIAN',
            subtitle: 'Wick Security & Anti-Raid Level',
            body:
              `> **Shield Level:** \`${s.antiRaidLevel.toUpperCase()}\`\n` +
              `> **Verification Gateway:** \`${s.verificationMode.toUpperCase()}\`\n` +
              `> **Whitelisted Co-Owners:** **${whitelist.length}**\n` +
              `> **Anti-Nuke Rate Limiters:** Active (Mass Channels, Roles, Bans & Kicks)`,
            buttons: [button.primary('panel:tab:security', '⚙️ Open Security Control Center')],
          }),
        ],
      });
    }
  },
};
