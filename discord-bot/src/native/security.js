import { PermissionsBitField } from 'discord.js';
import { authorize, NativeError, audit } from './core.js';

export class SecurityService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
    this.actionWindow = new Map(); // key: `${guildId}:${actorId}:${action}` -> timestamps[]
  }

  async isWhitelisted(guildId, userId) {
    const row = (
      await this.db.query(
        `SELECT 1 FROM security_whitelists WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
      )
    ).rows[0];
    return Boolean(row);
  }

  async addWhitelist(guildId, userId, role = 'co_owner', addedBy, ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'high', permissions: ['Administrator'] });

    await this.db.query(
      `INSERT INTO security_whitelists (guild_id, user_id, role, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET role = EXCLUDED.role, added_by = EXCLUDED.added_by`,
      [guildId, userId, role, addedBy]
    );

    await audit(this.db, ctx, {
      action: 'security.add_whitelist',
      domain: 'moderation',
      risk: 'high',
      metadata: { targetUserId: userId, role },
    });

    return { success: true, guildId, userId, role };
  }

  async removeWhitelist(guildId, userId, ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'high', permissions: ['Administrator'] });

    await this.db.query(
      `DELETE FROM security_whitelists WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );

    await audit(this.db, ctx, {
      action: 'security.remove_whitelist',
      domain: 'moderation',
      risk: 'high',
      metadata: { targetUserId: userId },
    });

    return { success: true };
  }

  async listWhitelist(guildId) {
    const rows = (
      await this.db.query(
        `SELECT * FROM security_whitelists WHERE guild_id = $1 ORDER BY created_at DESC`,
        [guildId]
      )
    ).rows;

    return rows.map((r) => ({
      userId: r.user_id,
      role: r.role,
      addedBy: r.added_by,
      createdAt: r.created_at,
    }));
  }

  async setLockdown(guild, enabled = true, reason = 'Emergency Security Lockdown', ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'high', permissions: ['Administrator'] });

    const everyoneRole = guild.roles.everyone;
    const perms = new PermissionsBitField(everyoneRole.permissions);

    if (enabled) {
      // Deny messaging and voice
      perms.remove([
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.SendMessagesInThreads,
        PermissionsBitField.Flags.CreatePublicThreads,
        PermissionsBitField.Flags.CreatePrivateThreads,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.CreateInstantInvite,
      ]);
    } else {
      // Re-enable standard member permissions
      perms.add([
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.SendMessagesInThreads,
        PermissionsBitField.Flags.Connect,
      ]);
    }

    await everyoneRole.setPermissions(perms, reason);

    await audit(this.db, ctx, {
      action: enabled ? 'security.lockdown_enable' : 'security.lockdown_disable',
      domain: 'moderation',
      risk: 'high',
      metadata: { enabled, reason },
    });

    return {
      success: true,
      lockdownActive: enabled,
      reason,
    };
  }

  checkAntiNukeRate(guildId, actorId, action, maxAllowed = 3, windowSeconds = 10) {
    const key = `${guildId}:${actorId}:${action}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    let timestamps = this.actionWindow.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < windowMs);
    timestamps.push(now);
    this.actionWindow.set(key, timestamps);

    if (timestamps.length > maxAllowed) {
      return {
        exceeded: true,
        count: timestamps.length,
        maxAllowed,
        action,
      };
    }

    return {
      exceeded: false,
      count: timestamps.length,
      maxAllowed,
      action,
    };
  }

  async recordIncident({ guildId, actorId, action, threshold, metadata = {} }) {
    const row = (
      await this.db.query(
        `INSERT INTO security_incidents (guild_id, actor_id, action, threshold, status, metadata)
         VALUES ($1, $2, $3, $4, 'quarantined', $5) RETURNING *`,
        [guildId, actorId, action, String(threshold), JSON.stringify(metadata)]
      )
    ).rows[0];

    return row;
  }

  async listIncidents(guildId, limit = 10) {
    const rows = (
      await this.db.query(
        `SELECT * FROM security_incidents WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [guildId, limit]
      )
    ).rows;

    return rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      action: r.action,
      threshold: r.threshold,
      status: r.status,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }
}
