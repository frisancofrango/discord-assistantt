import { createHash } from 'node:crypto';
import { EmbeddingClient, EmbeddingError } from './embeddings.js';

/** Cap auto-ingested conversation exchanges per user to bound table growth. */
const EXCHANGE_CAP_PER_SCOPE = 250;

function scopedHash(content) {
  return createHash('sha256').update(String(content)).digest('hex');
}

/**
 * pgvector-backed semantic memory service.
 *
 * Writes embed `content` via the configured embeddings client and upsert rows
 * scoped to (guild, user) with a content-hash unique key so repeated writes are
 * cheap idempotent refreshes. Reads run a cosine-distance (`<=>`) search.
 *
 * Scoping filters against `metadata->>'discordGuildId'` / `metadata->>'discordUserId'`
 * so callers can pass raw Discord snowflake IDs.
 */
export class SemanticMemoryService {
  constructor({ db, embedder, logger = null, searchLimit = 8 }) {
    this.db = db;
    this.embedder = embedder ?? new EmbeddingClient({});
    this.logger = logger;
    this.searchLimit = searchLimit;
  }

  get enabled() {
    return this.embedder.enabled;
  }

  async remember({ guildId, userId, kind = 'fact', content, metadata = {} }) {
    if (!content?.trim()) return { stored: false, reason: 'empty_content' };
    if (!this.enabled) return { stored: false, reason: 'embeddings_disabled' };
    const embedding = await this.embedder.embedOne(content);
    if (!embedding) return { stored: false, reason: 'embedding_empty' };
    const hash = scopedHash(content);
    const literal = EmbeddingClient.toLiteral(embedding);
    const meta = { ...metadata };
    if (guildId) meta.discordGuildId = String(guildId);
    if (userId) meta.discordUserId = String(userId);

    const { rows } = await this.db.query(
      `INSERT INTO semantic_memories (guild_id,user_id,kind,content,metadata,content_hash,embedding)
       SELECT g.id,u.id,$1,$2,$3,$4,$5::vector
       FROM (SELECT id FROM users WHERE discord_id=$7) u
       LEFT JOIN (SELECT id FROM guilds WHERE discord_id=$6) g ON $6 IS NOT NULL
       WHERE $6 IS NULL OR g.id IS NOT NULL
       ON CONFLICT (guild_id,user_id,content_hash) DO UPDATE
         SET content=excluded.content, metadata=excluded.metadata, embedding=excluded.embedding, updated_at=now()
       RETURNING id, kind, updated_at`,
      [kind, String(content), JSON.stringify(meta), hash, literal, guildId ?? null, userId ?? null],
    );
    const row = rows[0] ?? null;
    if (row && kind === 'exchange') await this.#trimExchanges({ guildId, userId });
    return { id: row?.id ?? null, stored: Boolean(row) };
  }

  /** Upsert is no-op when no matching guild/user rows exist; ensure lookup rows. */
  async ensureScope({ guildId = null, guildName = null, userId = null, username = null }) {
    if (guildId) await this.db.query(
      `INSERT INTO guilds(discord_id,name) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET name=COALESCE(excluded.name,guilds.name)`,
      [String(guildId), guildName],
    );
    if (userId) await this.db.query(
      `INSERT INTO users(discord_id,username) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET username=COALESCE(excluded.username,users.username)`,
      [String(userId), username],
    );
  }

  async search({ query, guildId = null, userId = null, limit = this.searchLimit }) {
    if (!this.enabled || !query?.trim()) return [];
    let embedding;
    try {
      embedding = await this.embedder.embedOne(query);
    } catch (error) {
      this.logger?.error?.({ err: error }, 'semantic search embedding failed');
      return [];
    }
    if (!embedding) return [];
    const literal = EmbeddingClient.toLiteral(embedding);
    const { rows } = await this.db.query(
      `SELECT kind,content,metadata,created_at,updated_at, (embedding <=> $3::vector) AS distance
       FROM semantic_memories
       WHERE ($1::text IS NULL OR metadata->>'discordGuildId'=$1)
         AND ($2::text IS NULL OR metadata->>'discordUserId'=$2)
       ORDER BY embedding <=> $3::vector ASC
       LIMIT $4`,
      [guildId ?? null, userId ?? null, literal, Math.min(Math.max(limit, 1), 50)],
    );
    return rows;
  }

  async recent({ guildId = null, userId = null, limit = 10 }) {
    const { rows } = await this.db.query(
      `SELECT kind,content,metadata,created_at,updated_at
       FROM semantic_memories
       WHERE ($1::text IS NULL OR metadata->>'discordGuildId'=$1)
         AND ($2::text IS NULL OR metadata->>'discordUserId'=$2)
       ORDER BY updated_at DESC LIMIT $3`,
      [guildId ?? null, userId ?? null, Math.min(Math.max(limit, 1), 50)],
    );
    return rows;
  }

  async forget(id) {
    const { rowCount } = await this.db.query('DELETE FROM semantic_memories WHERE id=$1', [id]);
    return { removed: (rowCount ?? 0) > 0 };
  }

  async forgetAll({ guildId = null } = {}) {
    const { rowCount } = await this.db.query(
      `DELETE FROM semantic_memories WHERE ($1::text IS NULL OR metadata->>'discordGuildId'=$1)`,
      [guildId ?? null],
    );
    return { removed: rowCount ?? 0 };
  }

  async stats() {
    const { rows } = await this.db.query(
      `SELECT (SELECT COUNT(*)::int FROM semantic_memories) AS total,
              COALESCE(jsonb_agg(x) FILTER (WHERE x IS NOT NULL), '[]') AS by_kind
       FROM (SELECT kind, COUNT(*)::int AS count FROM semantic_memories GROUP BY kind) x`,
    );
    const row = rows[0] ?? { total: 0, by_kind: '[]' };
    return { enabled: this.enabled, model: this.embedder.model, dimensions: this.embedder.dimensions, total: row.total, byKind: row.by_kind };
  }

  async #trimExchanges({ guildId, userId }) {
    await this.db.query(
      `DELETE FROM semantic_memories s
       WHERE kind='exchange'
         AND ($3::text IS NULL OR s.metadata->>'discordGuildId'=$3)
         AND ($4::text IS NULL OR s.metadata->>'discordUserId'=$4)
         AND s.id NOT IN (
           SELECT id FROM semantic_memories
           WHERE kind='exchange'
             AND ($1::text IS NULL OR metadata->>'discordGuildId'=$1)
             AND ($2::text IS NULL OR metadata->>'discordUserId'=$2)
           ORDER BY updated_at DESC LIMIT $5
         )`,
      [guildId ?? null, userId ?? null, guildId ?? null, userId ?? null, EXCHANGE_CAP_PER_SCOPE],
    );
  }
}

export { EmbeddingError };