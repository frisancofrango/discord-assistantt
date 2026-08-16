import { authorize, audit } from './core.js';

export class SubscriptionService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async grantRoleSubscription({ guildId, memberId, roleId, durationDays = 30, orderId = null }, client) {
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    const row = (
      await this.db.query(
        `INSERT INTO member_role_subscriptions (guild_id, member_id, role_id, order_id, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING *`,
        [guildId, memberId, roleId, orderId, expiresAt]
      )
    ).rows[0];

    // Assign role in Discord if client is available
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(memberId).catch(() => null);
        if (member) {
          await member.roles.add(roleId, `VIP Subscription: ${durationDays} days`);
        }
      }
    } catch (err) {
      this.logger?.warn({ err: err.message, memberId, roleId }, 'failed to grant discord role for subscription');
    }

    return {
      id: row.id,
      guildId: row.guild_id,
      memberId: row.member_id,
      roleId: row.role_id,
      expiresAt: row.expires_at,
      status: row.status,
    };
  }

  async enforceExpirations(client) {
    const { rows } = await this.db.query(
      `SELECT * FROM member_role_subscriptions WHERE status = 'active' AND expires_at <= now()`
    );

    for (const sub of rows) {
      try {
        const guild = await client.guilds.fetch(sub.guild_id).catch(() => null);
        if (guild) {
          const member = await guild.members.fetch(sub.member_id).catch(() => null);
          if (member) {
            await member.roles.remove(sub.role_id, 'VIP Subscription Expired');
          }
        }
        await this.db.query(
          `UPDATE member_role_subscriptions SET status = 'expired' WHERE id = $1`,
          [sub.id]
        );
      } catch (err) {
        this.logger?.warn({ err: err.message, subId: sub.id }, 'failed to revoke expired subscription role');
      }
    }

    return rows.length;
  }

  async getMemberSubscriptions(guildId, memberId) {
    const { rows } = await this.db.query(
      `SELECT * FROM member_role_subscriptions WHERE guild_id = $1 AND member_id = $2 ORDER BY created_at DESC`,
      [guildId, memberId]
    );
    return rows;
  }
}
