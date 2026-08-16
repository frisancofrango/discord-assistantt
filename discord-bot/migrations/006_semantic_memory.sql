-- Semantic memory: pgvector-backed RAG store for Loop.
-- Vectors are produced by an OpenAI-compatible embeddings endpoint
-- (default: Nomic Embed Text v1.5, 768 dimensions).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE semantic_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id uuid REFERENCES guilds(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'fact',
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  content_hash text NOT NULL,
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, user_id, content_hash)
);
CREATE INDEX semantic_memories_scope_idx ON semantic_memories(guild_id, user_id, kind);
CREATE INDEX semantic_memories_embedding_idx ON semantic_memories USING hnsw (embedding vector_cosine_ops);
