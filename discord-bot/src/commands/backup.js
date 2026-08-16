import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Server template backup and OAuth2 member restore management.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Create a full snapshot backup of this server (roles, channels, permissions).')
        .addStringOption((o) =>
          o.setName('name').setDescription('Backup snapshot name').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('List all saved server template backups.')
    )
    .addSubcommand((s) =>
      s
        .setName('restore')
        .setDescription('Restore server channels and roles from a backup snapshot.')
        .addStringOption((o) =>
          o.setName('backup_id').setDescription('Backup snapshot ID').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s.setName('oauth_stats').setDescription('View OAuth2 member backup count ready for restore.')
    ),

  async execute(interaction, client) {
    const backup = client.runtime?.native?.backup;
    if (!backup) {
      return interaction.reply({ content: 'Backup service is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'create') {
      await interaction.deferReply({ ephemeral: true });
      const name = interaction.options.getString('name') || `Backup_${new Date().toISOString().slice(0, 10)}`;

      try {
        const result = await backup.createSnapshot(interaction.guild, interaction.user.id, name, ctx);
        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: 'SERVER BACKUP CREATED',
              body:
                `Snapshot **${result.name}** saved successfully!\n\n` +
                `> **Channels Saved:** ${result.channelCount}\n` +
                `> **Roles Saved:** ${result.roleCount}\n` +
                `> **Backup ID:** \`${result.id}\``,
            }),
          ],
        });
      } catch (err) {
        return interaction.editReply({
          flags: V2,
          components: [notice({ title: 'BACKUP FAILED', body: err.message })],
        });
      }
    }

    if (sub === 'list') {
      const list = await backup.listBackups(interaction.guildId);
      if (!list.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NO BACKUPS', body: 'No backups found for this server.' })],
        });
      }

      const lines = list.map((b) => {
        const time = `<t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`;
        return `> **\`${b.id}\`** — **${b.name}** (${b.channelCount} ch, ${b.roleCount} roles) · ${time}`;
      }).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'SERVER BACKUP SNAPSHOTS',
            subtitle: `${list.length} saved snapshot(s)`,
            body: lines,
            buttons: [button.primary('panel:tab:backups', '⚙️ Open in Control Center')],
          }),
        ],
      });
    }

    if (sub === 'restore') {
      const backupId = interaction.options.getString('backup_id', true);
      await interaction.deferReply({ ephemeral: true });

      try {
        const result = await backup.restoreServer(interaction.guild, backupId, ctx);
        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: 'SERVER RESTORE COMPLETE',
              body: `Successfully restored **${result.restoredRoles}** roles and **${result.restoredChannels}** channels from backup \`${backupId}\`.`,
            }),
          ],
        });
      } catch (err) {
        return interaction.editReply({
          flags: V2,
          components: [notice({ title: 'RESTORE FAILED', body: err.message })],
        });
      }
    }

    if (sub === 'oauth_stats') {
      const stats = await backup.getOAuthStats(interaction.guildId);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'OAUTH2 MEMBER RESTORE STATS',
            subtitle: 'RestoreCord & Disaster Recovery Standard',
            body:
              `> **Total Members Backed Up:** **${stats.totalMembersBackedUp}**\n` +
              `> **Active Access Tokens:** **${stats.activeTokensCount}**\n` +
              `> **Rejoin Capability:** Instant 1-click migration to backup guilds`,
            footer: 'Tokens refreshed automatically during verification gateway.',
          }),
        ],
      });
    }
  },
};
