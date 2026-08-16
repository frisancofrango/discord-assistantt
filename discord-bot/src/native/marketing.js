import { NativeError, authorize, audit, idempotent, secureToken } from './core.js';

const prohibited = /unsolicited|scrap(?:e|ing)|fake engagement|evad(?:e|ing)|mass dm|bypass/i;

export class MarketingService {
  constructor({ db, queue, tools, analytics, config = {} }) {
    Object.assign(this, { db, queue, tools, analytics });
    this.config = { maxRatePerMinute: config.maxRatePerMinute ?? 30, ...config };
  }

  async consent({ memberId, purpose, status, source, proof = {} }, ctx) {
    if (!['opted_in', 'opted_out'].includes(status)) throw new NativeError('invalid_input', 'Invalid consent status');
    if (status === 'opted_in' && !['member_command', 'member_button', 'imported_proof'].includes(source)) {
      throw new NativeError('invalid_consent', 'Consent source is not acceptable');
    }
    const row = (
      await this.db.query(
        `INSERT INTO marketing_consent (guild_id, member_id, purpose, status, source, proof, consented_at, opted_out_at)
         VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 = 'opted_in' THEN now() END, CASE WHEN $4 = 'opted_out' THEN now() END)
         ON CONFLICT (guild_id, member_id, purpose) DO UPDATE SET
           status = EXCLUDED.status,
           source = EXCLUDED.source,
           proof = EXCLUDED.proof,
           consented_at = CASE WHEN EXCLUDED.status = 'opted_in' THEN now() ELSE marketing_consent.consented_at END,
           opted_out_at = CASE WHEN EXCLUDED.status = 'opted_out' THEN now() ELSE NULL END,
           updated_at = now()
         RETURNING *`,
        [ctx.guildId, memberId, purpose, status, source, JSON.stringify(proof)]
      )
    ).rows[0];

    await audit(this.db, ctx, { action: `marketing.${status}`, domain: 'marketing', risk: 'low', metadata: { memberId, purpose } });
    return row;
  }

  async createCampaign(input, ctx) {
    authorize(ctx, { domain: 'marketing', risk: 'medium', permissions: ['ManageGuild'], consent: true });
    if (prohibited.test(`${input.name} ${JSON.stringify(input.template)}`)) {
      throw new NativeError('policy_denied', 'Spam, scraping, fake engagement, and evasion are prohibited');
    }
    if (input.ratePerMinute > this.config.maxRatePerMinute) throw new NativeError('rate_limit_policy', 'Campaign rate exceeds policy');

    return (
      await this.db.query(
        `INSERT INTO campaigns (guild_id, name, purpose, status, template, segment_id, scheduled_at, quiet_hours, rate_per_minute, experiment, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          ctx.guildId,
          input.name,
          input.purpose,
          input.scheduledAt ? 'scheduled' : 'draft',
          JSON.stringify(input.template),
          input.segmentId,
          input.scheduledAt ?? null,
          JSON.stringify(input.quietHours ?? {}),
          input.ratePerMinute ?? 20,
          JSON.stringify(input.experiment ?? {}),
          ctx.actor.id,
        ]
      )
    ).rows[0];
  }

  async schedule(campaignId, ctx) {
    authorize(ctx, { domain: 'marketing', risk: 'high', permissions: ['ManageGuild'], consent: true });
    const campaign = (
      await this.db.query(
        `UPDATE campaigns SET status = 'scheduled', updated_at = now() WHERE id = $1 AND status = 'draft' AND scheduled_at IS NOT NULL RETURNING *`,
        [campaignId]
      )
    ).rows[0];
    if (!campaign) throw new NativeError('invalid_transition', 'Campaign cannot be scheduled');

    await this.queue.enqueue(
      'native-jobs',
      'marketing.send',
      { campaignId },
      { idempotencyKey: `campaign:send:${campaignId}`, jobOptions: { delay: Math.max(0, new Date(campaign.scheduled_at) - Date.now()) } }
    );
    return campaign;
  }

  async recipients(campaignId) {
    return (
      await this.db.query(
        `SELECT c.member_id FROM campaigns x
         JOIN marketing_segments s ON s.id = x.segment_id
         JOIN marketing_consent c ON c.guild_id = x.guild_id AND c.purpose = x.purpose AND c.status = 'opted_in'
         WHERE x.id = $1 AND NOT EXISTS (SELECT 1 FROM campaign_deliveries d WHERE d.campaign_id = x.id AND d.member_id = c.member_id)`,
        [campaignId]
      )
    ).rows;
  }

  async send(campaignId, deliver) {
    const campaign = (await this.db.query(`SELECT * FROM campaigns WHERE id = $1 FOR UPDATE`, [campaignId])).rows[0];
    if (!campaign || !['scheduled', 'sending'].includes(campaign.status)) return { sent: 0, skipped: true };

    const quiet = campaign.quiet_hours ?? {};
    const hour = new Date().getUTCHours();
    if (
      quiet.startUtc != null &&
      quiet.endUtc != null &&
      (quiet.startUtc <= quiet.endUtc ? hour >= quiet.startUtc && hour < quiet.endUtc : hour >= quiet.startUtc || hour < quiet.endUtc)
    ) {
      await this.queue.enqueue(
        'native-jobs',
        'marketing.send',
        { campaignId },
        { idempotencyKey: `campaign:send:${campaignId}:quiet:${new Date().toISOString().slice(0, 13)}`, jobOptions: { delay: 3600000 } }
      );
      return { sent: 0, quietHours: true };
    }

    await this.db.query(`UPDATE campaigns SET status = 'sending', updated_at = now() WHERE id = $1`, [campaignId]);
    const recipients = await this.recipients(campaignId);
    let sent = 0;

    for (const r of recipients) {
      const current = (
        await this.db.query(`SELECT status FROM marketing_consent WHERE guild_id = $1 AND member_id = $2 AND purpose = $3`, [
          campaign.guild_id,
          r.member_id,
          campaign.purpose,
        ])
      ).rows[0];
      if (current?.status !== 'opted_in') continue;

      const token = secureToken(18);
      const variant = campaign.experiment?.variants?.[sent % campaign.experiment.variants.length]?.id ?? 'control';

      await idempotent(this.db, 'campaign.delivery', `${campaignId}:${r.member_id}`, { campaignId, memberId: r.member_id }, async (c) => {
        await deliver({ memberId: r.member_id, template: campaign.template, attributionToken: token, variant });
        await c.query(
          `INSERT INTO campaign_deliveries (campaign_id, member_id, status, variant, attribution_token, sent_at)
           VALUES ($1, $2, 'sent', $3, $4, now())`,
          [campaignId, r.member_id, variant, token]
        );
        return { sent: true };
      });
      sent++;
    }

    await this.db.query(`UPDATE campaigns SET status = 'completed', updated_at = now() WHERE id = $1`, [campaignId]);
    await this.analytics?.record({
      guildId: campaign.guild_id,
      name: 'campaign.sent',
      subjectType: 'campaign',
      subjectId: campaignId,
      metrics: { recipients: sent },
      idempotencyKey: `campaign:${campaignId}:completed`,
    });
    return { sent };
  }

  async createFlashDrop({ guildId, title, variantId, dropPriceMinor, maxStock = null, durationHours = 2 }, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'medium', financial: true, permissions: ['ManageGuild'] });

    const expiresAt = new Date(Date.now() + durationHours * 3600000);
    const row = (
      await this.db.query(
        `INSERT INTO flash_drops (guild_id, title, variant_id, drop_price_minor, max_stock, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [guildId, title, variantId, dropPriceMinor, maxStock, expiresAt]
      )
    ).rows[0];

    return {
      id: row.id,
      guildId: row.guild_id,
      title: row.title,
      variantId: row.variant_id,
      dropPriceMinor: Number(row.drop_price_minor),
      maxStock: row.max_stock,
      claimedStock: row.claimed_stock,
      expiresAt: row.expires_at,
    };
  }

  async listFlashDrops(guildId) {
    const rows = (
      await this.db.query(
        `SELECT * FROM flash_drops WHERE guild_id = $1 AND active = true AND expires_at > now() ORDER BY created_at DESC`,
        [guildId]
      )
    ).rows;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      variantId: r.variant_id,
      dropPriceMinor: Number(r.drop_price_minor),
      maxStock: r.max_stock,
      claimedStock: r.claimed_stock,
      expiresAt: r.expires_at,
    }));
  }

  async submitReview({ orderId, guildId, memberId, rating, comment = null, walletService }, ctx) {
    const order = (await this.db.query(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];
    if (!order) throw new NativeError('not_found', 'Order not found');

    const cashbackBonusMinor = 100; // $1.00 store credit reward for verified review

    const row = (
      await this.db.query(
        `INSERT INTO order_reviews (order_id, guild_id, member_id, rating, comment, cashback_awarded_minor)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (order_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
         RETURNING *`,
        [orderId, guildId, memberId, rating, comment, cashbackBonusMinor]
      )
    ).rows[0];

    if (walletService) {
      await walletService.deposit(
        {
          guildId,
          memberId,
          amountMinor: cashbackBonusMinor,
          currency: 'USD',
          reference: `review_bonus:${orderId}`,
        },
        ctx
      ).catch(() => {});
    }

    return {
      reviewId: row.id,
      orderId: row.order_id,
      rating: row.rating,
      cashbackAwardedMinor: cashbackBonusMinor,
    };
  }

  async listReviews(guildId, limit = 10) {
    const rows = (
      await this.db.query(
        `SELECT * FROM order_reviews WHERE guild_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [guildId, limit]
      )
    ).rows;

    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      memberId: r.member_id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
    }));
  }

  async recoverJobs() {
    const rows = (await this.db.query(`SELECT id, scheduled_at FROM campaigns WHERE status IN ('scheduled', 'sending')`)).rows;
    for (const r of rows) {
      await this.queue.enqueue(
        'native-jobs',
        'marketing.send',
        { campaignId: r.id },
        { idempotencyKey: `campaign:send:${r.id}`, jobOptions: { delay: Math.max(0, new Date(r.scheduled_at ?? 0) - Date.now()) } }
      );
    }
    return rows.length;
  }
}
