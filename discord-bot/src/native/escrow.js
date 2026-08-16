import { NativeError, authorize, audit } from './core.js';

export class EscrowService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async createDeal({ guildId, buyerId, sellerId, amountMinor, currency = 'USD', terms }, ctx) {
    if (buyerId === sellerId) throw new NativeError('invalid_input', 'Buyer and Seller cannot be the same user.');
    if (!terms || terms.trim().length < 5) throw new NativeError('invalid_input', 'Please specify detailed deal terms.');
    const amount = Number(amountMinor);
    if (isNaN(amount) || amount <= 0) throw new NativeError('invalid_input', 'Invalid escrow amount.');

    const row = (
      await this.db.query(
        `INSERT INTO escrow_deals (guild_id, buyer_id, seller_id, amount_minor, currency, terms, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_deposit') RETURNING *`,
        [guildId, buyerId, sellerId, amount, currency, terms]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'escrow.create',
      domain: 'commerce',
      risk: 'medium',
      financial: true,
      metadata: { dealId: row.id, buyerId, sellerId, amountMinor: amount },
    });

    return this.serialize(row);
  }

  async depositAndLock({ dealId, buyerId, walletService }, ctx) {
    const deal = await this.getDeal(dealId);
    if (!deal) throw new NativeError('not_found', 'Escrow deal not found.');
    if (deal.buyerId !== buyerId) throw new NativeError('unauthorized', 'Only the buyer can fund this escrow deal.');
    if (deal.status !== 'pending_deposit') throw new NativeError('invalid_transition', `Deal is already in ${deal.status} state.`);

    // Withdraw from buyer's wallet into escrow hold
    await walletService.withdraw(
      {
        guildId: deal.guildId,
        memberId: buyerId,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        destination: `escrow_lock:${deal.id}`,
        idempotencyKey: `escrow:fund:${deal.id}`,
      },
      ctx
    );

    const updated = (
      await this.db.query(
        `UPDATE escrow_deals SET status = 'funds_locked', updated_at = now() WHERE id = $1 RETURNING *`,
        [dealId]
      )
    ).rows[0];

    return this.serialize(updated);
  }

  async markDelivered({ dealId, sellerId }, ctx) {
    const deal = await this.getDeal(dealId);
    if (!deal) throw new NativeError('not_found', 'Escrow deal not found.');
    if (deal.sellerId !== sellerId) throw new NativeError('unauthorized', 'Only the seller can mark goods as delivered.');
    if (deal.status !== 'funds_locked') throw new NativeError('invalid_transition', 'Funds are not currently locked in escrow.');

    const updated = (
      await this.db.query(
        `UPDATE escrow_deals SET status = 'delivered', updated_at = now() WHERE id = $1 RETURNING *`,
        [dealId]
      )
    ).rows[0];

    return this.serialize(updated);
  }

  async releaseEscrow({ dealId, buyerId, walletService }, ctx) {
    const deal = await this.getDeal(dealId);
    if (!deal) throw new NativeError('not_found', 'Escrow deal not found.');
    if (deal.buyerId !== buyerId) throw new NativeError('unauthorized', 'Only the buyer can release escrow funds.');
    if (!['funds_locked', 'delivered'].includes(deal.status)) {
      throw new NativeError('invalid_transition', 'Cannot release funds in current deal state.');
    }

    // Transfer funds to seller wallet
    await walletService.deposit(
      {
        guildId: deal.guildId,
        memberId: deal.sellerId,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        reference: `escrow_payout:${deal.id}`,
      },
      ctx
    );

    const updated = (
      await this.db.query(
        `UPDATE escrow_deals SET status = 'completed', resolved_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
        [dealId]
      )
    ).rows[0];

    return this.serialize(updated);
  }

  async disputeDeal({ dealId, actorId, reason }, ctx) {
    const deal = await this.getDeal(dealId);
    if (!deal) throw new NativeError('not_found', 'Escrow deal not found.');
    if (deal.buyerId !== actorId && deal.sellerId !== actorId) {
      throw new NativeError('unauthorized', 'Only deal participants can file a dispute.');
    }
    if (!['funds_locked', 'delivered'].includes(deal.status)) {
      throw new NativeError('invalid_transition', 'Cannot dispute a deal that is not active.');
    }

    const updated = (
      await this.db.query(
        `UPDATE escrow_deals SET status = 'disputed', updated_at = now() WHERE id = $1 RETURNING *`,
        [dealId]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'escrow.dispute',
      domain: 'commerce',
      risk: 'high',
      metadata: { dealId, actorId, reason },
    });

    return this.serialize(updated);
  }

  async arbitrateDeal({ dealId, decision, staffId, walletService }, ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'high', financial: true, permissions: ['ManageGuild'] });
    const deal = await this.getDeal(dealId);
    if (!deal) throw new NativeError('not_found', 'Escrow deal not found.');
    if (deal.status !== 'disputed') throw new NativeError('invalid_transition', 'Only disputed deals can be arbitrated.');

    if (decision === 'release_to_seller') {
      await walletService.deposit(
        {
          guildId: deal.guildId,
          memberId: deal.sellerId,
          amountMinor: deal.amountMinor,
          currency: deal.currency,
          reference: `escrow_arbitration_payout:${deal.id}`,
        },
        ctx
      );
      const updated = (
        await this.db.query(
          `UPDATE escrow_deals SET status = 'completed', resolved_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
          [dealId]
        )
      ).rows[0];
      return this.serialize(updated);
    } else if (decision === 'refund_buyer') {
      await walletService.deposit(
        {
          guildId: deal.guildId,
          memberId: deal.buyerId,
          amountMinor: deal.amountMinor,
          currency: deal.currency,
          reference: `escrow_arbitration_refund:${deal.id}`,
        },
        ctx
      );
      const updated = (
        await this.db.query(
          `UPDATE escrow_deals SET status = 'refunded', resolved_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
          [dealId]
        )
      ).rows[0];
      return this.serialize(updated);
    }

    throw new NativeError('invalid_input', 'Decision must be release_to_seller or refund_buyer.');
  }

  async getDeal(dealId) {
    const row = (await this.db.query(`SELECT * FROM escrow_deals WHERE id = $1`, [dealId])).rows[0];
    return row ? this.serialize(row) : null;
  }

  async listUserDeals(guildId, userId) {
    const rows = (
      await this.db.query(
        `SELECT * FROM escrow_deals WHERE guild_id = $1 AND (buyer_id = $2 OR seller_id = $2) ORDER BY created_at DESC LIMIT 10`,
        [guildId, userId]
      )
    ).rows;
    return rows.map((r) => this.serialize(r));
  }

  serialize(r) {
    return {
      id: r.id,
      guildId: r.guild_id,
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      terms: r.terms,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      resolvedAt: r.resolved_at,
    };
  }
}
