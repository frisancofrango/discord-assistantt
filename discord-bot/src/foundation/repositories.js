import { randomUUID } from 'node:crypto';

const TABLES = Object.freeze({
  guilds: ['discord_id', 'name', 'settings'], users: ['discord_id', 'username', 'profile'],
  conversations: ['guild_id', 'channel_id', 'thread_id', 'status', 'metadata'],
  messages: ['conversation_id', 'discord_id', 'author_id', 'content', 'metadata'],
  messageRevisions: ['message_id', 'revision', 'content', 'metadata'], memories: ['guild_id', 'user_id', 'kind', 'content', 'metadata'],
  tasks: ['guild_id', 'actor_id', 'domain', 'risk', 'status', 'goal', 'idempotency_key', 'metadata'],
  taskSteps: ['task_id', 'position', 'kind', 'status', 'input', 'output', 'error'],
  toolInvocations: ['task_id', 'step_id', 'tool_name', 'idempotency_key', 'status', 'input', 'output', 'error'],
  evidence: ['task_id', 'step_id', 'invocation_id', 'kind', 'uri', 'payload', 'sha256'],
  audit: ['guild_id', 'actor_id', 'action', 'domain', 'risk', 'decision', 'reason', 'correlation_id', 'metadata'],
  autonomyPolicies: ['guild_id', 'domain', 'level', 'config'], approvals: ['task_id', 'guild_id', 'requested_by', 'decided_by', 'status', 'reason', 'expires_at'],
  budgets: ['guild_id', 'domain', 'period', 'limit_amount', 'spent_amount', 'currency', 'resets_at'],
  modelUsage: ['task_id','step_id','profile_id','capability','attempt','input_tokens','output_tokens','cost_usd','latency_ms'],
  taskCheckpoints: ['task_id','step_id','state'],
  researchSources: ['task_id','step_id','url','content_type','size_bytes','sha256','quarantine_path','metadata'],
});
const snake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const jsonColumns = new Set(['settings','profile','metadata','input','output','error','payload','config','state']);

class Repository {
  constructor(db, table, allowed) { this.db = db; this.table = snake(table); this.allowed = allowed; }
  async create(data, client = this.db) {
    const clean = Object.fromEntries(Object.entries(data).filter(([k, v]) => this.allowed.includes(k) && v !== undefined));
    const keys = Object.keys(clean); if (!keys.length) throw new TypeError('No writable fields supplied');
    const values = keys.map((k) => jsonColumns.has(k) && clean[k] !== null ? JSON.stringify(clean[k]) : clean[k]);
    const sql = `INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`;
    return (await client.query(sql, values)).rows[0];
  }
  async get(id, client = this.db) { return (await client.query(`SELECT * FROM ${this.table} WHERE id=$1`, [id])).rows[0] ?? null; }
  async find(where = {}, { limit = 100, offset = 0 } = {}, client = this.db) {
    const entries = Object.entries(where).filter(([k]) => this.allowed.includes(k) || k === 'id');
    const clause = entries.length ? ` WHERE ${entries.map(([k], i) => `${k}=$${i + 1}`).join(' AND ')}` : '';
    const values = entries.map(([,v]) => v);
    return (await client.query(`SELECT * FROM ${this.table}${clause} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, Math.min(limit, 500), offset])).rows;
  }
  async update(id, patch, client = this.db) {
    const entries = Object.entries(patch).filter(([k, v]) => this.allowed.includes(k) && v !== undefined);
    if (!entries.length) return this.get(id, client);
    const values = entries.map(([k,v]) => jsonColumns.has(k) && v !== null ? JSON.stringify(v) : v);
    return (await client.query(`UPDATE ${this.table} SET ${entries.map(([k],i)=>`${k}=$${i+1}`).join(',')}, updated_at=now() WHERE id=$${entries.length+1} RETURNING *`, [...values,id])).rows[0] ?? null;
  }
}
export function createRepositories(db) {
  const repos = Object.fromEntries(Object.entries(TABLES).map(([name, fields]) => [name, new Repository(db, name, fields)]));
  repos.transaction = async (fn) => { const client = await db.connect(); try { await client.query('BEGIN'); const result = await fn(client, repos); await client.query('COMMIT'); return result; } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } };
  repos.audit.record = (event, client) => repos.audit.create({ id: randomUUID(), ...event }, client);
  repos.toolInvocations.claim = async (data, client = db) => (await client.query(`INSERT INTO tool_invocations (task_id,step_id,tool_name,idempotency_key,status,input) VALUES($1,$2,$3,$4,'running',$5) ON CONFLICT(idempotency_key) DO UPDATE SET updated_at=now() RETURNING *`, [data.task_id,data.step_id,data.tool_name,data.idempotency_key,JSON.stringify(data.input ?? {})])).rows[0];
  return repos;
}
