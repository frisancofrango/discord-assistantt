import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { createRepositories } from '../src/foundation/repositories.js';

async function fixture() {
  const mem = newDb();
  mem.public.none(`CREATE TABLE guilds (id uuid PRIMARY KEY, discord_id text UNIQUE NOT NULL, name text, settings jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()); CREATE TABLE audit (id uuid PRIMARY KEY, guild_id uuid, actor_id uuid, action text, domain text, risk text, decision text, reason text, correlation_id uuid, metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());`);
  const { Pool } = mem.adapters.createPg(); const pool = new Pool(); return { pool, repos:createRepositories(pool) };
}
test('repository creates, reads, updates, and filters records', async () => {
  const {pool,repos}=await fixture();
  const id='00000000-0000-4000-8000-000000000001';
  await pool.query('INSERT INTO guilds(id,discord_id,name) VALUES($1,$2,$3)',[id,'42','Before']);
  assert.equal((await repos.guilds.get(id)).name,'Before');
  assert.equal((await repos.guilds.update(id,{name:'After',notAllowed:'x'})).name,'After');
  assert.equal((await repos.guilds.find({discord_id:'42'})).length,1);
  await pool.end();
});
test('transaction rolls back and releases its client on failure', async () => {
  const calls = [];
  const client = { query: async (sql) => { calls.push(sql); }, release: () => calls.push('RELEASE') };
  const repos = createRepositories({ connect: async () => client });
  await assert.rejects(repos.transaction(async () => { throw new Error('stop'); }), /stop/);
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});
