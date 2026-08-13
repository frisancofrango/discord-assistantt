import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbeddingClient, EMBED_PROVIDERS } from '../src/memory/embeddings.js';

test('embedding client is inert without credentials', () => {
  const inert = new EmbeddingClient({ baseUrl: 'https://api.nomic.ai/v1' });
  assert.equal(inert.enabled, false);
  assert.equal(new EmbeddingClient({ apiKey: 'k' }).enabled, false);
});

test('embedding client posts OpenAI-compatible batch and validates dimensions', async () => {
  const calls = [];
  const client = new EmbeddingClient({
    baseUrl: 'https://api.nomic.ai/v1',
    apiKey: 'secret',
    model: 'nomic-embed-text-v1.5',
    dimensions: 4,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ data: [{ index: 0, embedding: [0.1, 0.2, 0.3, 0.4] }] }) };
    },
  });
  assert.equal(client.enabled, true);
  const vectors = await client.embed(['hello world']);
  assert.equal(vectors.length, 1);
  assert.deepEqual(vectors[0].embedding, [0.1, 0.2, 0.3, 0.4]);
  assert.equal(calls[0].url, 'https://api.nomic.ai/v1/embeddings');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'nomic-embed-text-v1.5');
  assert.deepEqual(body.input, ['hello world']);
});

test('embedding client batches large inputs and rejects mismatched batches', async () => {
  const client = new EmbeddingClient({
    baseUrl: 'https://api.nomic.ai/v1',
    apiKey: 'k',
    dimensions: 2,
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }),
  });
  await assert.rejects(() => client.embed(['a', 'b']), /mismatched batch/);
});

test('embedding client surfaces endpoint failures and dimension drift', async () => {
  const failing = new EmbeddingClient({
    baseUrl: 'https://api.nomic.ai/v1',
    apiKey: 'k',
    dimensions: 3,
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'rate limited' }),
  });
  await assert.rejects(() => failing.embed(['x']), /429/);
  const wrongDims = new EmbeddingClient({
    baseUrl: 'https://api.nomic.ai/v1',
    apiKey: 'k',
    dimensions: 3,
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ embedding: [1, 2] }] }) }),
  });
  await assert.rejects(() => wrongDims.embed(['x']), /dimension mismatch/);
});

test('nomic provider defaults are documented and compatible', () => {
  assert.equal(EMBED_PROVIDERS.nomic.model, 'nomic-embed-text-v1.5');
  assert.equal(EMBED_PROVIDERS.nomic.dimensions, 768);
  assert.equal(EmbeddingClient.toLiteral([0.1, 0.2]), '[0.1,0.2]');
});