import test from 'node:test';
import assert from 'node:assert/strict';
import { SemanticMemoryService } from '../src/memory/store.js';
import { EmbeddingClient } from '../src/memory/embeddings.js';

const dims = 4;
const vectors = { alpha: [0.1, 0.2, 0.3, 0.4], beta: [0.9, 0.1, 0.2, 0.3] };
function fakeEmbedder() {
  return new EmbeddingClient({
    baseUrl: 'https://api.nomic.ai/v1',
    apiKey: 'k',
    model: 'nomic-embed-text-v1.5',
    dimensions: dims,
    fetchImpl: async (_url, init) => {
      const input = JSON.parse(init.body).input;
      return { ok: true, json: async () => ({ data: input.map((t) => ({ index: 0, embedding: vectors[t.includes('alpha') ? 'alpha' : 'beta'] })) }) };
    },
  });
}

/** Query-recording fake pool with pg-ish result shape. */
function fakeDb() {
  const log = [];
  const db = { log, query: async () => ({ rows: [] }), respond(result) { db.query = async (sql, params) => { log.push({ sql, params }); return result; }; } };
  return db;
}

test('remember upserts scoped rows with vector literal and content hash', async () => {
  const db = fakeDb();
  db.respond({ rows: [{ id: 'mem-1', kind: 'fact', updated_at: new Date() }] });
  const svc = new SemanticMemoryService({ db, embedder: fakeEmbedder() });
  const first = await svc.remember({ guildId: 'g1', userId: 'u1', content: 'alpha fact' });
  assert.deepEqual(first, { id: 'mem-1', stored: true });
  const second = await svc.remember({ guildId: 'g1', userId: 'u1', content: 'alpha fact' });
  assert.deepEqual(second, { id: 'mem-1', stored: true });
  assert.equal(db.log.length, 2);
  const { sql, params } = db.log[0];
  assert.match(sql, /INSERT INTO semantic_memories/);
  assert.match(sql, /ON CONFLICT \(guild_id,user_id,content_hash\)/);
  assert.match(params[4], /^\[0\.1,0\.2,0\.3,0\.4\]$/); // vector literal
  assert.equal(params[5], 'g1');
  assert.equal(params[6], 'u1');
  assert.equal(params[1], 'alpha fact');
  assert.equal(params[0], 'fact');
});

test('remember is a no-op when embeddings have no base URL', async () => {
  const db = fakeDb();
  const svc = new SemanticMemoryService({ db, embedder: new EmbeddingClient({}) });
  assert.equal(svc.enabled, false);
  const result = await svc.remember({ guildId: 'g1', userId: 'u1', content: 'x' });
  assert.deepEqual(result, { stored: false, reason: 'embeddings_disabled' });
  assert.equal(db.log.length, 0);
});

test('rememberState rolls a single per-channel digest row (capped lines)', async () => {
  const log = [];
  const queue = [
    { rows: [] }, // first prior lookup: none yet
    { rows: [{ id: 'state-1' }] }, // first insert
    { rows: [{ kind: 'state', content: 'round 1: paper beats rock, score 1-0', metadata: {} }] }, // second prior lookup
    { rows: [{ id: 'state-1' }] }, // second insert (upsert)
  ];
  const db = { log, query: async (sql, params) => { log.push({ sql, params }); return queue.shift() ?? { rows: [] }; } };
  const svc = new SemanticMemoryService({ db, embedder: fakeEmbedder() });
  const first = await svc.rememberState({ guildId: 'g1', userId: 'u1', channelId: 'c1', line: 'round 1: paper beats rock, score 1-0' });
  assert.equal(first.stored, true);
  const insert1 = log[1];
  assert.match(insert1.sql, /INSERT INTO semantic_memories/);
  assert.match(insert1.sql, /kind='state'/);
  const hash = insert1.params[2];
  const second = await svc.rememberState({ guildId: 'g1', userId: 'u1', channelId: 'c1', line: 'round 2: scissors beats paper, score 2-0' });
  assert.equal(second.stored, true);
  const insert2 = log[3];
  assert.equal(insert2.params[0], 'round 1: paper beats rock, score 1-0\nround 2: scissors beats paper, score 2-0');
  assert.equal(insert2.params[2], hash); // same digest row keeps upserting in place
});

test('rememberState is a no-op without an embeddings base URL', async () => {
  const db = fakeDb();
  const svc = new SemanticMemoryService({ db, embedder: new EmbeddingClient({}) });
  assert.deepEqual(await svc.rememberState({ guildId: 'g1', userId: 'u1', channelId: 'c1', line: 'x' }), { stored: false });
  assert.equal(db.log.length, 0);
});

test('search runs cosine distance query scoped to guild/user with limits', async () => {
  const db = fakeDb();
  db.respond({ rows: [{ kind: 'fact', content: 'alpha', distance: 0.02 }] });
  const svc = new SemanticMemoryService({ db, embedder: fakeEmbedder(), searchLimit: 8 });
  const results = await svc.search({ query: 'alpha', guildId: 'g1', userId: 'u1' });
  assert.equal(results.length, 1);
  const { sql, params } = db.log[0];
  assert.match(sql, /embedding <=> \$3::vector/);
  assert.equal(params[0], 'g1');
  assert.equal(params[1], 'u1');
  assert.equal(params[3], 8);
  assert.deepEqual(await svc.search({ query: '', guildId: 'g1' }), []);
});

test('search is empty when embeddings disabled or embedding fails', async () => {
  const db = fakeDb();
  const inert = new SemanticMemoryService({ db, embedder: new EmbeddingClient({ baseUrl: 'x' }) });
  assert.deepEqual(await inert.search({ query: 'q' }), []);
  const failing = new SemanticMemoryService({
    db,
    embedder: new EmbeddingClient({ baseUrl: 'x', apiKey: 'k', fetchImpl: async () => { throw new Error('boom'); } }),
    logger: { error: () => {} },
  });
  assert.deepEqual(await failing.search({ query: 'q' }), []);
});

test('recent, forget, forgetAll and stats hit the expected tables', async () => {
  const db = fakeDb();
  db.respond({ rows: [], rowCount: 0 });
  const svc = new SemanticMemoryService({ db, embedder: fakeEmbedder() });
  await svc.recent({ guildId: 'g1', limit: 5 });
  assert.match(db.log.at(-1).sql, /FROM semantic_memories/);
  await svc.forget('abc');
  assert.match(db.log.at(-1).sql, /DELETE FROM semantic_memories WHERE id=\$1/);
  await svc.forgetAll({ guildId: 'g1' });
  assert.match(db.log.at(-1).sql, /metadata->>'discordGuildId'/);
  db.respond({ rows: [{ total: 3, by_kind: '[{"kind":"fact","count":3}]' }] });
  const stats = await svc.stats();
  assert.equal(stats.total, 3);
  assert.equal(stats.enabled, true);
  assert.equal(stats.dimensions, dims);
});

test('exchange ingestion is capped per scope', async () => {
  const db = fakeDb();
  db.respond({ rows: [{ id: 'e', kind: 'exchange' }] });
  const svc = new SemanticMemoryService({ db, embedder: fakeEmbedder() });
  await svc.remember({ guildId: 'g1', userId: 'u1', kind: 'exchange', content: 'U: hi\nA: hello' });
  const { sql, params } = db.log.at(-1);
  assert.match(sql, /kind='exchange'/);
  assert.equal(params[4], 250);
});