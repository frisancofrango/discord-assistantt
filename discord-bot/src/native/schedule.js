import { PermissionsBitField } from 'discord.js';
import { authorize, NativeError, audit } from './core.js';

export const DEFAULT_HOURS = {
  enabled: true,
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  startTime: '09:00',
  endTime: '22:00',
  timezone: 'UTC',
  outOfOfficeMessage: 'Our support team is currently offline. Please leave your message and staff will assist you as soon as hours open.',
};

export class OperatingHoursService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async getOperatingHours(guildId) {
    const row = (
      await this.db.query(`SELECT * FROM guild_operating_hours WHERE guild_id = $1`, [guildId])
    ).rows[0];

    if (!row) {
      return { guildId, ...DEFAULT_HOURS, isOpen: true };
    }

    const isOpen = this.checkIfOpen(row);
    return {
      guildId: row.guild_id,
      enabled: row.enabled,
      days: row.days,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone: row.timezone,
      outOfOfficeMessage: row.out_of_office_message,
      isOpen,
    };
  }

  checkIfOpen(hours) {
    if (!hours.enabled) return true;

    const now = new Date();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = dayNames[now.getUTCDay()];

    if (!hours.days.includes(currentDay)) return false;

    const [startH, startM] = hours.start_time.split(':').map(Number);
    const [endH, endM] = hours.end_time.split(':').map(Number);

    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  async setOperatingHours(guildId, { enabled = true, days, startTime, endTime, timezone = 'UTC', outOfOfficeMessage }, ctx) {
    authorize(ctx, { domain: 'server_design', risk: 'medium', permissions: ['ManageGuild'] });

    const row = (
      await this.db.query(
        `INSERT INTO guild_operating_hours (guild_id, enabled, days, start_time, end_time, timezone, out_of_office_message, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (guild_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           days = EXCLUDED.days,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           timezone = EXCLUDED.timezone,
           out_of_office_message = EXCLUDED.out_of_office_message,
           updated_at = now()
         RETURNING *`,
        [
          guildId,
          enabled,
          days || DEFAULT_HOURS.days,
          startTime || DEFAULT_HOURS.startTime,
          endTime || DEFAULT_HOURS.endTime,
          timezone,
          outOfOfficeMessage || DEFAULT_HOURS.outOfOfficeMessage,
        ]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'operating_hours.update',
      domain: 'server_design',
      risk: 'medium',
      metadata: { startTime, endTime, days, enabled },
    });

    return {
      guildId: row.guild_id,
      enabled: row.enabled,
      days: row.days,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone: row.timezone,
      outOfOfficeMessage: row.out_of_office_message,
      isOpen: this.checkIfOpen(row),
    };
  }

  async lockChannel(channel, reason = 'Channel locked by staff', ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'medium', permissions: ['ManageChannels'] });

    const guild = channel.guild;
    const everyoneRole = guild.roles.everyone;

    await channel.permissionOverwrites.edit(everyoneRole, {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    }, { reason });

    await audit(this.db, ctx, {
      action: 'channel.lock',
      domain: 'moderation',
      risk: 'medium',
      metadata: { channelId: channel.id, reason },
    });

    return { success: true, channelId: channel.id, locked: true };
  }

  async unlockChannel(channel, reason = 'Channel unlocked by staff', ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'medium', permissions: ['ManageChannels'] });

    const guild = channel.guild;
    const everyoneRole = guild.roles.everyone;

    await channel.permissionOverwrites.edit(everyoneRole, {
      SendMessages: null,
      SendMessagesInThreads: null,
    }, { reason });

    await audit(this.db, ctx, {
      action: 'channel.unlock',
      domain: 'moderation',
      risk: 'medium',
      metadata: { channelId: channel.id, reason },
    });

    return { success: true, channelId: channel.id, locked: false };
  }

  async setChannelSchedule(guildId, channelId, lockTime, unlockTime, timezone = 'UTC', ctx) {
    authorize(ctx, { domain: 'server_design', risk: 'medium', permissions: ['ManageChannels'] });

    const row = (
      await this.db.query(
        `INSERT INTO channel_schedules (guild_id, channel_id, lock_time, unlock_time, timezone, enabled)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (guild_id, channel_id) DO UPDATE SET
           lock_time = EXCLUDED.lock_time,
           unlock_time = EXCLUDED.unlock_time,
           timezone = EXCLUDED.timezone,
           enabled = true
         RETURNING *`,
        [guildId, channelId, lockTime, unlockTime, timezone]
      )
    ).rows[0];

    return row;
  }

  async listChannelSchedules(guildId) {
    return (
      await this.db.query(
        `SELECT * FROM channel_schedules WHERE guild_id = $1 AND enabled = true`,
        [guildId]
      )
    ).rows;
  }
}
