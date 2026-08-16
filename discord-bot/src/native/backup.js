import { ChannelType, PermissionsBitField } from 'discord.js';
import { authorize, NativeError, audit } from './core.js';

export class BackupService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async createSnapshot(guild, creatorId, name = `Backup_${new Date().toISOString().slice(0, 10)}`, ctx) {
    authorize(ctx, { domain: 'server_design', risk: 'high', permissions: ['Administrator'] });

    if (!guild) throw new NativeError('invalid_guild', 'Guild is required for backup');

    // Fetch channels and roles
    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();

    const rolesData = roles
      .filter((r) => !r.managed && r.id !== guild.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        position: r.position,
        permissions: r.permissions.bitfield.toString(),
        mentionable: r.mentionable,
      }));

    const channelsData = channels
      .filter((c) => Boolean(c))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        position: c.position,
        topic: c.topic || null,
        nsfw: c.nsfw || false,
        rateLimitPerUser: c.rateLimitPerUser || 0,
        permissionOverwrites: c.permissionOverwrites?.cache?.map((p) => ({
          id: p.id,
          type: p.type,
          allow: p.allow.bitfield.toString(),
          deny: p.deny.bitfield.toString(),
        })) || [],
      }));

    const snapshot = {
      guildId: guild.id,
      guildName: guild.name,
      iconURL: guild.iconURL(),
      afkChannelId: guild.afkChannelId,
      afkTimeout: guild.afkTimeout,
      systemChannelId: guild.systemChannelId,
      roles: rolesData,
      channels: channelsData,
      createdAt: new Date().toISOString(),
    };

    const row = (
      await this.db.query(
        `INSERT INTO server_backups (guild_id, name, creator_id, channel_count, role_count, snapshot)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [guild.id, name, creatorId, channelsData.length, rolesData.length, JSON.stringify(snapshot)]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'backup.create',
      domain: 'server_design',
      risk: 'high',
      metadata: { backupId: row.id, name, channels: channelsData.length, roles: rolesData.length },
    });

    return {
      id: row.id,
      name: row.name,
      guildId: row.guild_id,
      channelCount: row.channel_count,
      roleCount: row.role_count,
      createdAt: row.created_at,
    };
  }

  async listBackups(guildId) {
    const rows = (
      await this.db.query(
        `SELECT id, guild_id, name, creator_id, channel_count, role_count, created_at
         FROM server_backups WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [guildId]
      )
    ).rows;

    return rows.map((r) => ({
      id: r.id,
      guildId: r.guild_id,
      name: r.name,
      creatorId: r.creator_id,
      channelCount: r.channel_count,
      roleCount: r.role_count,
      createdAt: r.created_at,
    }));
  }

  async getBackup(backupId) {
    const row = (
      await this.db.query(`SELECT * FROM server_backups WHERE id = $1`, [backupId])
    ).rows[0];

    if (!row) throw new NativeError('backup_not_found', 'Backup snapshot not found');

    return {
      id: row.id,
      name: row.name,
      guildId: row.guild_id,
      channelCount: row.channel_count,
      roleCount: row.role_count,
      snapshot: row.snapshot,
      createdAt: row.created_at,
    };
  }

  async restoreServer(guild, backupId, ctx) {
    authorize(ctx, { domain: 'server_design', risk: 'high', permissions: ['Administrator'] });

    const backup = await this.getBackup(backupId);
    const { roles, channels } = backup.snapshot;

    const roleMap = new Map();

    // 1. Create Roles
    for (const r of roles) {
      const existing = guild.roles.cache.find((x) => x.name === r.name && !x.managed);
      if (!existing) {
        try {
          const created = await guild.roles.create({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            permissions: BigInt(r.permissions),
            mentionable: r.mentionable,
            reason: `Restoring from backup ${backup.name}`,
          });
          roleMap.set(r.id, created.id);
        } catch (err) {
          this.logger?.warn({ err: err.message, roleName: r.name }, 'failed to restore role');
        }
      } else {
        roleMap.set(r.id, existing.id);
      }
    }

    // 2. Create Categories First
    const categoryMap = new Map();
    const categories = channels.filter((c) => c.type === ChannelType.GuildCategory);
    for (const cat of categories) {
      try {
        const created = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          position: cat.position,
          reason: `Restoring from backup ${backup.name}`,
        });
        categoryMap.set(cat.id, created.id);
      } catch (err) {
        this.logger?.warn({ err: err.message, catName: cat.name }, 'failed to restore category');
      }
    }

    // 3. Create Text and Voice Channels
    const nonCategories = channels.filter((c) => c.type !== ChannelType.GuildCategory);
    for (const ch of nonCategories) {
      try {
        const parent = ch.parentId ? categoryMap.get(ch.parentId) : undefined;
        await guild.channels.create({
          name: ch.name,
          type: ch.type,
          parent,
          topic: ch.topic,
          nsfw: ch.nsfw,
          rateLimitPerUser: ch.rateLimitPerUser,
          reason: `Restoring from backup ${backup.name}`,
        });
      } catch (err) {
        this.logger?.warn({ err: err.message, chName: ch.name }, 'failed to restore channel');
      }
    }

    await audit(this.db, ctx, {
      action: 'backup.restore',
      domain: 'server_design',
      risk: 'high',
      metadata: { backupId, rolesCount: roles.length, channelsCount: channels.length },
    });

    return {
      success: true,
      restoredRoles: roles.length,
      restoredChannels: channels.length,
    };
  }

  async saveOAuthMember({ guildId, userId, accessToken, refreshToken, expiresAt, ipAddress }) {
    await this.db.query(
      `INSERT INTO oauth_members (guild_id, user_id, access_token, refresh_token, expires_at, ip_address, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (guild_id, user_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         ip_address = EXCLUDED.ip_address,
         updated_at = now()`,
      [guildId, userId, accessToken, refreshToken, new Date(expiresAt), ipAddress || null]
    );
  }

  async getOAuthStats(guildId) {
    const total = (
      await this.db.query(`SELECT count(*)::int as count FROM oauth_members WHERE guild_id = $1`, [guildId])
    ).rows[0]?.count || 0;

    const active = (
      await this.db.query(
        `SELECT count(*)::int as count FROM oauth_members WHERE guild_id = $1 AND expires_at > now()`,
        [guildId]
      )
    ).rows[0]?.count || 0;

    return {
      totalMembersBackedUp: total,
      activeTokensCount: active,
    };
  }
}
