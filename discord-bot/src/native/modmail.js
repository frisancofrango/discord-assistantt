import { authorize, audit } from './core.js';

export class ModmailService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async getOpenThread(guildId, memberId) {
    const row = (
      await this.db.query(
        `SELECT * FROM modmail_threads WHERE guild_id = $1 AND member_id = $2 AND status = 'open'`,
        [guildId, memberId]
      )
    ).rows[0];
    return row;
  }

  async getThreadByThreadId(threadId) {
    const row = (
      await this.db.query(
        `SELECT * FROM modmail_threads WHERE thread_id = $1 AND status = 'open'`,
        [threadId]
      )
    ).rows[0];
    return row;
  }

  async createThread(guildId, memberId, threadId, ctx) {
    const row = (
      await this.db.query(
        `INSERT INTO modmail_threads (guild_id, member_id, thread_id, status)
         VALUES ($1, $2, $3, 'open') RETURNING *`,
        [guildId, memberId, threadId]
      )
    ).rows[0];

    return row;
  }

  async closeThread(threadId, ctx) {
    const row = (
      await this.db.query(
        `UPDATE modmail_threads SET status = 'closed', closed_at = now() WHERE thread_id = $1 RETURNING *`,
        [threadId]
      )
    ).rows[0];

    return row;
  }
}
