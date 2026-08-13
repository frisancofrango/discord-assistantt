/**
 * OpenAI-compatible embeddings client.
 *
 * Default target is Nomic Embed Text (https://atlas.nomic.ai/atlas-api),
 * which exposes `POST /v1/embeddings` with `nomic-embed-text-v1.5`
 * (768 dimensions, 8192-token context).
 *
 * The client is inert when no API key / base URL is configured so the bot
 * degrades gracefully to relational memory only.
 */

const MAX_INPUTS_PER_REQUEST = 32;
const MAX_INPUT_CHARS = 8000;

export class EmbeddingError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'EmbeddingError';
    this.code = 'embedding_failed';
    this.cause = cause;
  }
}

export class EmbeddingClient {
  constructor({ baseUrl, apiKey = null, model = 'nomic-embed-text-v1.5', dimensions = 768, timeoutMs = 30_000, fetchImpl = globalThis.fetch, logger = null }) {
    this.baseUrl = String(baseUrl ?? '').replace(/\/$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.apiKey && this.baseUrl);
  }

  /**
   * Embed one or more texts. Returns an array of `{ index, embedding }`
   * records in input order.
   */
  async embed(inputs) {
    if (!this.enabled) throw new EmbeddingError('Embeddings are not configured (EMBED_API_KEY missing)');
    const list = (Array.isArray(inputs) ? inputs : [inputs]).map((v) => String(v ?? '').trim().slice(0, MAX_INPUT_CHARS)).filter(Boolean);
    if (!list.length) return [];
    const vectors = [];
    for (let i = 0; i < list.length; i += MAX_INPUTS_PER_REQUEST) {
      const batch = list.slice(i, i + MAX_INPUTS_PER_REQUEST);
      const response = await this.fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({ model: this.model, input: batch }),
      });
      if (!response.ok) throw new EmbeddingError(`Embeddings endpoint returned ${response.status}`, await response.text().catch(() => ''));
      const body = await response.json();
      const data = Array.isArray(body?.data) ? body.data : [];
      if (data.length !== batch.length) throw new EmbeddingError('Embeddings endpoint returned a mismatched batch');
      for (const item of data) {
        if (item.embedding.length !== this.dimensions) throw new EmbeddingError(`Embedding dimension mismatch: expected ${this.dimensions}, got ${item.embedding.length}. Set EMBED_DIMENSIONS to match your model.`);
        vectors.push({ index: item.index ?? null, embedding: item.embedding });
      }
    }
    return vectors;
  }

  async embedOne(text) {
    const [vector] = await this.embed([text]);
    return vector?.embedding ?? null;
  }

  /** Postgres-safe vector literal, e.g. `[0.1,0.2,...]`. */
  static toLiteral(values) {
    return `[${values.join(',')}]`;
  }
}

/** Well-known embeddings endpoints. */
export const EMBED_PROVIDERS = Object.freeze({
  nomic: { baseUrl: 'https://api.nomic.ai/v1', model: 'nomic-embed-text-v1.5', dimensions: 768 },
});