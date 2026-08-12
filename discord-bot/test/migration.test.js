import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('foundation migration defines every required persistence table', async () => {
  const sql = await readFile(new URL('../migrations/001_foundation.sql', import.meta.url), 'utf8');
  for (const table of ['guilds','users','conversations','messages','message_revisions','memories','tasks','task_steps','tool_invocations','evidence','audit','autonomy_policies','approvals','budgets']) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`, 'i'), table);
  }
  assert.match(sql, /idempotency_key text UNIQUE NOT NULL/i);
});
test('agent migration persists usage, checkpoints, and research sources', async () => {
  const sql = await readFile(new URL('../migrations/002_agent_runtime.sql', import.meta.url), 'utf8');
  for (const table of ['model_usage','task_checkpoints','research_sources']) assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`, 'i'), table);
});
test('safe autonomy migration persists proposals, grants, execution, budgets and receipts', async () => {
  const sql = await readFile(new URL('../migrations/004_safe_autonomy.sql', import.meta.url), 'utf8');
  for (const table of ['proposals','approval_tokens','proposal_decisions','workflow_executions','workflow_steps','budget_reservations','workflow_receipts']) assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`, 'i'), table);
  assert.match(sql,/token_hash text UNIQUE NOT NULL/i);
  assert.match(sql,/UNIQUE\(execution_id,step_key\)/i);
});
