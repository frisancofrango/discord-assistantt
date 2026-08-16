import { NativeError, authorize, audit } from './core.js';

export class RobloxService {
  constructor({ db, fetchFn = globalThis.fetch }) {
    this.db = db;
    this.fetch = fetchFn;
  }

  /**
   * Roblox 70/30 Marketplace Fee Calculation.
   * Roblox deducts a 30% platform fee on all asset/gamepass sales.
   * To deliver `net` Robux to the creator/seller:
   *   grossPrice = Math.ceil(net / 0.7)
   *   robloxFee = grossPrice - net (approx 30%)
   *   actualNet = Math.floor(grossPrice * 0.7)
   */
  calculateFee(targetAmount, isNet = true) {
    const amt = parseInt(targetAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      throw new NativeError('invalid_amount', 'Robux amount must be a positive integer');
    }

    if (isNet) {
      const gross = Math.ceil(amt / 0.7);
      const fee = gross - amt;
      const verifiedNet = Math.floor(gross * 0.7);
      return {
        targetNet: amt,
        grossPrice: gross,
        feeAmount: fee,
        effectiveNet: verifiedNet,
        feePercentage: 30,
      };
    } else {
      const gross = amt;
      const net = Math.floor(gross * 0.7);
      const fee = gross - net;
      return {
        grossPrice: gross,
        targetNet: net,
        feeAmount: fee,
        effectiveNet: net,
        feePercentage: 30,
      };
    }
  }

  /**
   * Resolve Roblox username to ID using Roblox Public API.
   */
  async lookupUser(username) {
    if (!username || typeof username !== 'string') {
      throw new NativeError('invalid_username', 'Valid Roblox username is required');
    }

    const clean = username.trim();
    const res = await this.fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Azure-Discord-Bot/1.1' },
      body: JSON.stringify({ usernames: [clean], excludeBannedUsers: false }),
    });

    if (!res.ok) {
      throw new NativeError('roblox_api_error', `Roblox API responded with status ${res.status}`);
    }

    const data = await res.json();
    const user = data.data?.[0];
    if (!user) {
      throw new NativeError('user_not_found', `Roblox user "${clean}" was not found`);
    }

    return {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      hasVerifiedBadge: user.hasVerifiedBadge ?? false,
    };
  }

  async linkAccount({ guildId, memberId, username, robloxId }, ctx) {
    authorize(ctx, { domain: 'verification', risk: 'low' });
    let resolvedId = robloxId;
    let resolvedName = username;

    if (!resolvedId) {
      const found = await this.lookupUser(username);
      resolvedId = found.id;
      resolvedName = found.name;
    }

    const row = (await this.db.query(
      `INSERT INTO roblox_links (guild_id, member_id, roblox_id, roblox_username, verified, updated_at)
       VALUES ($1, $2, $3, $4, true, now())
       ON CONFLICT (guild_id, member_id) DO UPDATE
       SET roblox_id = excluded.roblox_id,
           roblox_username = excluded.roblox_username,
           verified = true,
           updated_at = now()
       RETURNING *`,
      [guildId, memberId, resolvedId, resolvedName]
    )).rows[0];

    await audit(this.db, ctx, {
      action: 'roblox.link',
      domain: 'verification',
      risk: 'low',
      metadata: { memberId, robloxId: resolvedId, robloxUsername: resolvedName },
    });

    return {
      memberId: row.member_id,
      robloxId: Number(row.roblox_id),
      robloxUsername: row.roblox_username,
      verified: row.verified,
      updatedAt: row.updated_at,
    };
  }

  async getLinkedAccount(guildId, memberId) {
    const row = (await this.db.query(
      `SELECT * FROM roblox_links WHERE guild_id = $1 AND member_id = $2`,
      [guildId, memberId]
    )).rows[0];

    if (!row) return null;
    return {
      memberId: row.member_id,
      robloxId: Number(row.roblox_id),
      robloxUsername: row.roblox_username,
      verified: row.verified,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async unlinkAccount(guildId, memberId, ctx) {
    authorize(ctx, { domain: 'verification', risk: 'low' });
    const res = await this.db.query(
      `DELETE FROM roblox_links WHERE guild_id = $1 AND member_id = $2 RETURNING *`,
      [guildId, memberId]
    );

    await audit(this.db, ctx, {
      action: 'roblox.unlink',
      domain: 'verification',
      risk: 'low',
      metadata: { memberId },
    });

    return { unlinked: res.rowCount > 0 };
  }
}
