import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, notice, V2 } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Customer support ticketing with SLA tracking and audit transcripts.')
    .addSubcommand((s) =>
      s
        .setName('open')
        .setDescription('Open a private customer support ticket.')
        .addStringOption((o) =>
          o.setName('subject').setDescription('Brief description of your request').setRequired(true).setMaxLength(200)
        )
        .addStringOption((o) =>
          o
            .setName('category')
            .setDescription('Support category')
            .setRequired(false)
            .addChoices(
              { name: 'General Support', value: 'general' },
              { name: 'Billing & Payments', value: 'billing' },
              { name: 'Roblox & Delivery', value: 'roblox' },
              { name: 'Technical / Bot', value: 'technical' }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName('close')
        .setDescription('Close an active ticket channel.')
        .addStringOption((o) => o.setName('reason').setDescription('Reason for closing').setRequired(false))
    )
    .addSubcommand((s) =>
      s.setName('claim').setDescription('(Staff) Claim and assign this ticket to yourself.')
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('(Staff) List all currently open tickets.')
    ),

  async execute(interaction, client) {
    const tickets = client.runtime?.native?.tickets;
    if (!tickets) {
      return interaction.reply({ content: 'Ticket system is currently unavailable.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const ctx = actorContext(interaction);

    if (sub === 'open') {
      await interaction.deferReply({ ephemeral: true });
      const subject = interaction.options.getString('subject', true);
      const categoryKey = interaction.options.getString('category') || 'general';

      try {
        const ticket = await tickets.create(
          {
            idempotencyKey: `ticket:open:${interaction.guildId}:${interaction.user.id}:${Date.now()}`,
            memberId: interaction.user.id,
            categoryKey,
            subject,
          },
          ctx
        );

        // Try creating private channel or thread if permissions allow
        let channelMention = '';
        try {
          if (interaction.guild) {
            const ticketChannel = await interaction.guild.channels.create({
              name: `ticket-${ticket.sequence}`,
              type: ChannelType.GuildText,
              permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
                { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
              ],
            });

            await ticketChannel.send({
              flags: V2,
              components: [
                panel({
                  title: `TICKET #${ticket.sequence}`,
                  subtitle: `Category: ${categoryKey.toUpperCase()}`,
                  body:
                    `Hello <@${interaction.user.id}>, staff will be with you shortly.\n\n` +
                    `> **Subject:** ${subject}\n` +
                    `> **Status:** \`${ticket.status.toUpperCase()}\``,
                  buttons: [
                    button.danger(`ticket:close:${ticket.id}`, '🔒 Close Ticket'),
                    button.neutral(`ticket:claim:${ticket.id}`, '🙋 Claim Ticket'),
                  ],
                  footer: 'Loop Secure Support System',
                }),
              ],
            });

            channelMention = ` in <#${ticketChannel.id}>`;
            // Update ticket channel_id
            await client.runtime.db.query(
              `UPDATE tickets SET channel_id = $1 WHERE id = $2`,
              [ticketChannel.id, ticket.id]
            );
          }
        } catch (chanErr) {
          client.logger?.warn({ err: chanErr }, 'could not create private ticket channel, opened in place');
        }

        return interaction.editReply({
          flags: V2,
          components: [
            notice({
              title: `TICKET #${ticket.sequence} CREATED`,
              body: `Your ticket has been opened${channelMention}.\n**Subject:** ${subject}`,
              footer: 'Staff has been notified.',
            }),
          ],
        });
      } catch (err) {
        return interaction.editReply({
          flags: V2,
          components: [notice({ title: 'TICKET CREATION FAILED', body: err.message })],
        });
      }
    }

    if (sub === 'close') {
      const channelId = interaction.channelId;
      const ticketRow = (await client.runtime.db.query(
        `SELECT * FROM tickets WHERE channel_id = $1 OR (guild_id = $2 AND member_id = $3 AND status != 'closed') ORDER BY created_at DESC LIMIT 1`,
        [channelId, interaction.guildId, interaction.user.id]
      )).rows[0];

      if (!ticketRow) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NOT FOUND', body: 'No active ticket found in this context.' })],
        });
      }

      await tickets.closeByMember(ticketRow.id, interaction.user.id, `cmd:${interaction.id}`);
      return interaction.reply({
        flags: V2,
        components: [
          notice({
            title: `TICKET #${ticketRow.sequence} CLOSED`,
            body: `This ticket was closed by <@${interaction.user.id}>.\nA cryptographic transcript has been logged.`,
            footer: 'Thank you for contacting support.',
          }),
        ],
      });
    }

    if (sub === 'claim') {
      if (!interaction.memberPermissions?.has('ManageMessages')) {
        return interaction.reply({ content: 'Only staff can claim tickets.', ephemeral: true });
      }

      const ticketRow = (await client.runtime.db.query(
        `SELECT * FROM tickets WHERE channel_id = $1 OR guild_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [interaction.channelId, interaction.guildId]
      )).rows[0];

      if (!ticketRow) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NOT FOUND', body: 'No active ticket found.' })],
        });
      }

      await tickets.claim(ticketRow.id, interaction.user.id, ctx);
      return interaction.reply({
        flags: V2,
        components: [
          notice({
            title: `TICKET #${ticketRow.sequence} CLAIMED`,
            body: `This ticket is now being handled by <@${interaction.user.id}>.`,
          }),
        ],
      });
    }

    if (sub === 'list') {
      if (!interaction.memberPermissions?.has('ManageMessages')) {
        return interaction.reply({ content: 'Only staff can list open tickets.', ephemeral: true });
      }

      const openTickets = (await client.runtime.db.query(
        `SELECT * FROM tickets WHERE guild_id = $1 AND status != 'closed' ORDER BY sequence DESC LIMIT 10`,
        [interaction.guildId]
      )).rows;

      if (!openTickets.length) {
        return interaction.reply({
          flags: V2,
          ephemeral: true,
          components: [notice({ title: 'NO OPEN TICKETS', body: 'All tickets are currently resolved.' })],
        });
      }

      const lines = openTickets.map((t) =>
        `> **#${t.sequence}** [${t.status.toUpperCase()}] <@${t.member_id}>: *${t.subject}*`
      ).join('\n');

      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          notice({
            title: 'ACTIVE TICKETS',
            body: lines,
            footer: 'Loop Support Queue',
          }),
        ],
      });
    }
  },
};
