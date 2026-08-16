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
test('semantic memory migration enables pgvector and indexes embeddings', async () => {
  const sql = await readFile(new URL('../migrations/006_semantic_memory.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS vector/i);
  for (const constraint of ['semantic_memories','content_hash','embedding vector(768)','vector_cosine_ops']) assert.match(sql, new RegExp(constraint.replace(/[()]/g, '\\$&'), 'i'), constraint);
  assert.match(sql, /UNIQUE\(guild_id, user_id, content_hash\)/i);
});
test('wallet and roblox migration persists wallets, transactions and roblox links', async () => {
  const sql = await readFile(new URL('../migrations/009_wallet_and_roblox.sql', import.meta.url), 'utf8');
  for (const table of ['wallets', 'wallet_transactions', 'roblox_links', 'roblox_gamepasses']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'), table);
  }
  assert.match(sql, /balance_minor bigint NOT NULL DEFAULT 0/i);
  assert.match(sql, /UNIQUE\(guild_id, member_id, currency\)/i);
  assert.match(sql, /UNIQUE\(guild_id, member_id\)/i);
});
test('control panel and ai migration persists settings, coupons, canned responses, and knowledge nodes', async () => {
  const sql = await readFile(new URL('../migrations/010_control_panel_and_ai.sql', import.meta.url), 'utf8');
  for (const table of ['guild_settings', 'coupons', 'ticket_canned_responses', 'ai_knowledge_nodes']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'), table);
  }
  assert.match(sql, /anti_raid_level text NOT NULL DEFAULT 'standard'/i);
  assert.match(sql, /UNIQUE\(guild_id, code\)/i);
  assert.match(sql, /UNIQUE\(guild_id, content_hash\)/i);
});
test('enterprise suite migration persists oauth members, backups, license keys, security whitelists, and referrals', async () => {
  const sql = await readFile(new URL('../migrations/011_enterprise_suite.sql', import.meta.url), 'utf8');
  for (const table of ['oauth_members', 'server_backups', 'product_license_keys', 'security_whitelists', 'security_incidents', 'referral_codes', 'referral_commissions']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'), table);
  }
  assert.match(sql, /UNIQUE\(guild_id, user_id\)/i);
  assert.match(sql, /UNIQUE\(variant_id, license_key\)/i);
  assert.match(sql, /UNIQUE\(guild_id, code\)/i);
});
