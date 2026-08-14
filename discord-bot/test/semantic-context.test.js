import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb, DataType } from 'pg-mem';
import crypto from 'node:crypto';
import { ContextAssembler } from '../src/discord/context.js';

async function db() {
  const m = newDb();
  m.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, impure: true, implementation: () => crypto.randomUUID() });
  m.public.none(`
    CREATE TABLE guilds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),discord_id text UNIQUE NOT NULL,name text,settings jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),discord_id text UNIQUE NOT NULL,username text,profile jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid,channel_id text NOT NULL,thread_id text,status text DEFAULT 'active',metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid NOT NULL,discord_id text UNIQUE NOT NULL,author_id uuid,content text,metadata jsonb DEFAULT '{}',deleted_at timestamptz,referenced_message_id text,last_discord_edited_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE memories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id uuid,user_id uuid,kind text,content text,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text,goal text,domain text,risk text,metadata jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now());
CREATE TABLE user_aliases(discord_id text PRIMARY KEY,alias text NOT NULL,updated_at timestamptz DEFAULT now());
  `);
  return new (m.adapters.createPg().Pool)();
}

test('semantic memories from the RAG hook are assembled into context', async () => {
  const p = await db();
  const hook = async ({ guildId, userId, query, limit }) => [
    { kind: 'fact', content: 'Owner prefers minimal storefronts.', metadata: {}, distance: 0.01 },
  ];
  const c = await new ContextAssembler({ db: p, semanticSearch: hook, maxTokens: 1000 })
    .assemble({ messageId: '100000000000000001', guildId: '200000000000000001', channelId: '300000000000000001', userId: '400000000000000001' });
  assert.ok(c.semanticMemories.length >= 1);
  assert.equal(c.semanticMemories[0].content, 'Owner prefers minimal storefronts.');
});

test('context assembler tolerates a disabled semantic hook', async () => {
  const p = await db();
  const c = await new ContextAssembler({ db: p, semanticSearch: async () => [], maxTokens: 1000 })
    .assemble({ messageId: '100000000000000001', guildId: null, userId: '400000000000000001' });
  assert.deepEqual(c.semanticMemories, []);
  assert.ok(c.identity === 'Azure');
});