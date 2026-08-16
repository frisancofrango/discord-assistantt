# Semantic memory (RAG)

Loop keeps a pgvector-backed semantic memory store that feeds retrieval-augmented
context into the agent loop. Exact recent turns still come from the relational
`messages` tables; semantic memory answers the *"what have we talked about that is
relevant to this request?"* question that exact matching cannot.

## Architecture

```
Discord event ──► gateway runtime
                     │  engage? ──► ContextAssembler
                     │                └─ semanticSearch() ──► SemanticMemoryService.search()
                     │                                        (embed query → cosine search)
                     ▼
                 agent reply
                     │
                     └─ memory.remember(kind='exchange') ──► SemanticMemoryService.remember()
                                                            (embed content → upsert row)
```

- **Embedding client** (`src/memory/embeddings.js`) — OpenAI-compatible
  `POST /embeddings`. Default provider is **Nomic Embed Text**:
  `https://api.nomic.ai/v1`, model `nomic-embed-text-v1.5`, 768 dimensions.
  Any OpenAI-compatible embeddings endpoint works (`EMBED_BASE_URL`).
- **Store** (`src/memory/store.js`) — `semantic_memories` table with a
  `vector(768)` column and an HNSW cosine index
  (`migrations/006_semantic_memory.sql`). Rows are scoped to guild/user, keyed by
  `content_hash` so re-remembering the same text refreshes instead of duplicating.
- **Retrieval** — queries are embedded and compared with `embedding <=> query`
  (cosine distance), filtered by the Discord guild/user snowflake IDs stored in
  `metadata`. Results land in `context.semanticMemories` and are subject to the
  same token budget as every other context slice.
- **Ingestion** — every engaged exchange ("User: … / Loop: …") is remembered as
  `kind='exchange'` when `MEMORY_INGESTION=true`. Exchange rows are capped at 250
  per user to bound growth. Owners can store durable facts and wipe memory from
  the owner console.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `EMBED_BASE_URL` | `https://api.nomic.ai/v1` | OpenAI-compatible embeddings base URL |
| `EMBED_API_KEY` | empty | API key. **Empty disables RAG entirely** (relational memory only) |
| `EMBED_MODEL` | `nomic-embed-text-v1.5` | Embedding model id |
| `EMBED_DIMENSIONS` | `768` | Must match the model; mismatches fail loudly |
| `MEMORY_SEARCH_LIMIT` | `8` | Max semantic rows returned per context assembly |
| `MEMORY_INGESTION` | `true` | Auto-store engaged exchanges |

## Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;               -- requires pgvector (compose uses pgvector/pgvector:pg17)
CREATE TABLE semantic_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid REFERENCES guilds(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'fact',                  -- 'fact' | 'exchange' | free-form
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',               -- discordGuildId / discordUserId / channel
  content_hash text NOT NULL,
  embedding vector(768) NOT NULL,
  ...
  UNIQUE(guild_id, user_id, content_hash)
);
CREATE INDEX semantic_memories_embedding_idx ON semantic_memories USING hnsw (embedding vector_cosine_ops);
```

`UNIQUE(guild_id, user_id, content_hash)` makes `remember` an idempotent upsert.
Rows with `NULL` scope (DM-only memories) are exempt from the dedupe (PostgreSQL
unique index semantics) — memory writes should always carry a user id.

## Owner console

- `/admin health` — shows whether RAG is enabled, the embedding model/dimensions,
  and the row count.
- `/admin memory` — stats by kind plus the most recent rows; **Wipe All** deletes
  every semantic row for the current server.
- `/admin budget` — model spend vs. `AGENT_BUDGET_USD`, which also covers
  embedding calls as recorded in `model_usage` for chat completions.

## Failure behavior

- Missing `EMBED_API_KEY` → store reports `enabled: false`, search returns `[]`,
  remember is a no-op. The bot runs on relational memory alone.
- Embedding endpoint errors → search returns `[]` (logged); `remember` failures
  are caught at the gateway and logged, never thrown into the message path.
- Dimension mismatch → insert/search fail loudly so misconfiguration is caught
  at first use, not silently.

## Operations

- **Disable RAG:** leave `EMBED_API_KEY` empty, or set `MEMORY_INGESTION=false`
  to stop new writes while keeping search.
- **Wipe:** `/admin memory` → Wipe All, or `memory.forgetAll({ guildId })`.
- **Provider swap:** point `EMBED_BASE_URL`/`EMBED_MODEL` at any
  OpenAI-compatible endpoint and set `EMBED_DIMENSIONS` accordingly. The table
  column size is fixed by the migration; changing dimensions requires a new
  migration (`ALTER TABLE ... ALTER COLUMN embedding TYPE vector(N)`).
- **Backup:** the `semantic_memories` table is included in routine PostgreSQL
  dumps (see `docs/OPERATIONS.md` — backup/restore drill).
