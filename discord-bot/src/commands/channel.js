import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Channel lockdown, unlock, and automated operating schedule controls.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s
        .setName('lock')
        .setDescription('Lock a channel to prevent regular members from sending messages.')
        .addChannelOption((o) =>
          o.setName('target').setDescription('Channel to lock (defaults to current)').setRequired(false)
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Reason for locking').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('unlock')
        .setDescription('Unlock a channel to restore regular member messaging.')
        .addChannelOption((o) =>
          o.setName('target').setDescription('Channel to unlock (defaults to current)').setRequired(false)
        )
        .addStringOption((o) =>
          o.setName('reason').setDescription('Reason for unlocking').setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s.setName('hours').setDescription('Inspect server working & support service hours.')
    ),

  async execute(interaction, client) {
    const schedule = client.runtime?.native?.schedule;
    if (!schedule) {
      return interaction.reply({ content: 'Channel schedule system is unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'lock') {
      const channel = interaction.options.getChannel('target') || interaction.channel;
      const reason = interaction.options.getString('reason') || 'Manual Administrator Channel Lock';

      await interaction.deferReply({ ephemeral: true });
      try {
        await schedule.lockChannel(channel, reason, ctx);
        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: '🔒 CHANNEL LOCKED',
              body: `Successfully locked <#${channel.id}>.\n\n**Reason:** ${reason}`,
            }),
          ],
        });
      } catch (err) {
        return interaction.editReply({ flags: V2, components: [notice({ title: 'LOCK FAILED', body: err.message })] });
      }
    }

    if (sub === 'unlock') {
      const channel = interaction.options.getChannel('target') || interaction.channel;
      const reason = interaction.options.getString('reason') || 'Manual Administrator Channel Unlock';

      await interaction.deferReply({ ephemeral: true });
      try {
        await schedule.unlockChannel(channel, reason, ctx);
        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: '🔓 CHANNEL UNLOCKED',
              body: `Restored standard messaging permissions in <#${channel.id}>.`,
            }),
          ],
        });
      } catch (err) {
        return interaction.editReply({ flags: V2, components: [notice({ title: 'UNLOCK FAILED', body: err.message })] });
      }
    }

    if (sub === 'hours') {
      const hours = await schedule.getOperatingHours(interaction.guildId);
      const statusStr = hours.isOpen ? '🟢 **ONLINE & OPEN**' : '🔴 **CLOSED (OUT OF OFFICE)**';

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'SUPPORT & SERVICE OPERATING HOURS',
            subtitle: `Current Status: ${statusStr}`,
            body:
              `> **Active Days:** ${hours.days.map((d) => d.toUpperCase()).join(', ')}\n` +
              `> **Working Shifts:** **${hours.startTime} — ${hours.endTime} ${hours.timezone}**\n` +
              `> **Out of Office Notice:**\n> *"${hours.outOfOfficeMessage}"*`,
            buttons: [button.primary('panel:tab:schedules', '⏰ Manage in Control Panel')],
          }),
        ],
      });
    }
  },
};
