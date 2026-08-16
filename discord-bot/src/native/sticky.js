import { authorize, audit } from './core.js';
import { panel, V2 } from '../ui/theme.js';

export class StickyService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
    this.locks = new Set();
  }

  async setSticky(guildId, channelId, title, content, ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'medium', permissions: ['ManageMessages'] });

    const row = (
      await this.db.query(
        `INSERT INTO sticky_messages (channel_id, guild_id, title, content, enabled, updated_at)
         VALUES ($1, $2, $3, $4, true, now())
         ON CONFLICT (channel_id) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           enabled = true,
           updated_at = now()
         RETURNING *`,
        [channelId, guildId, title, content]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'sticky.set',
      domain: 'moderation',
      risk: 'low',
      metadata: { channelId, title },
    });

    return row;
  }

  async clearSticky(channelId, ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'low', permissions: ['ManageMessages'] });

    const row = (
      await this.db.query(`DELETE FROM sticky_messages WHERE channel_id = $1 RETURNING *`, [channelId])
    ).rows[0];

    return Boolean(row);
  }

  async getSticky(channelId) {
    const row = (await this.db.query(`SELECT * FROM sticky_messages WHERE channel_id = $1 AND enabled = true`, [channelId])).rows[0];
    return row;
  }

  async onChannelMessage(message) {
    if (!message.guild || message.author.bot) return;

    const channelId = message.channel.id;
    if (this.locks.has(channelId)) return;

    const sticky = await this.getSticky(channelId);
    if (!sticky) return;

    this.locks.add(channelId);
    try {
      // 1. Delete previous sticky message if exists
      if (sticky.last_message_id) {
        await message.channel.messages.delete(sticky.last_message_id).catch(() => {});
      }

      // 2. Post new sticky message at bottom of channel
      const sent = await message.channel.send({
        flags: V2,
        components: [
          panel({
            title: `📌 ${sticky.title.toUpperCase()}`,
            body: sticky.content,
            footer: 'Persistent Channel Notice · Automatically pinned to chat',
          }),
        ],
      });

      // 3. Update last message id
      await this.db.query(
        `UPDATE sticky_messages SET last_message_id = $1, updated_at = now() WHERE channel_id = $2`,
        [sent.id, channelId]
      );
    } catch (err) {
      this.logger?.warn({ err: err.message, channelId }, 'failed to update sticky message');
    } finally {
      this.locks.delete(channelId);
    }
  }
}
