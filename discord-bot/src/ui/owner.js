import { panel, button, V2 } from './theme.js';

const KINDS = Object.freeze({
  health: 'SYSTEM HEALTH',
  budget: 'AGENT BUDGET',
  approvals: 'PENDING APPROVALS',
  policies: 'AUTONOMY POLICIES',
  memory: 'SEMANTIC MEMORY',
});

/** Shared refresh/close controls for every owner panel. */
function controls(section, extra = []) {
  return [button.neutral(`adm:refresh:${section}`, 'Refresh'), ...extra, button.neutral(`adm:close`, 'Close')];
}

const esc = (v) => String(v ?? '').replace(/\*/g, '\\*');

export function healthPanel(data) {
  const models = Object.entries(data.models ?? {});
  const body = [
    `**Database:** ${data.database ? 'connected' : 'unavailable'}`,
    `**Redis:** ${data.redis ? 'connected' : 'unavailable'}`,
    `**Memory (RAG):** ${data.memory.enabled ? 'enabled' : 'disabled'}`,
    `**Embedding model:** ${esc(data.memory.model)} (${data.memory.dimensions}d)`,
    `**Semantic rows:** ${data.memory.total ?? 0}`,
  ].join('\n');
  const rows = models.length
    ? ['**Model health**', ...models.map(([id, h]) => `${esc(id)}: ${h.circuitOpen ? 'CIRCUIT OPEN' : 'healthy'} · ${h.calls} calls · ${h.failures} failures`)]
    : [];
  return { flags: V2, components: [panel({ title: `AZURE · ${KINDS.health}`, body: rows.length ? `${body}\n\n${rows.join('\n')}` : body, footer: `Snapshot at ${data.observedAt}`, buttons: controls('health') })] };
}

export function budgetPanel(data) {
  const spent = data.spent ?? 0;
  const limit = data.limit ?? 0;
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const body = [
    `**Spent:** $${spent.toFixed(4)} / $${limit.toFixed(2)} (${pct}%)`,
    ...(data.byCapability.length ? ['**By capability**', ...data.byCapability.map(([cap, cost]) => `${esc(cap)}: $${cost.toFixed(4)}`)] : []),
  ].join('\n');
  const rows = data.reservations?.length ? ['**Recent budget reservations**', ...data.reservations.map((r) => `${esc(r.domain)} · $${Number(r.amount).toFixed(4)} · ${r.status}`)] : [];
  return { flags: V2, components: [panel({ title: `AZURE · ${KINDS.budget}`, body: rows.length ? `${body}\n\n${rows.join('\n')}` : body, footer: `Period starts at ${data.periodStart}`, buttons: controls('budget') })] };
}

export function approvalsPanel(rows) {
  const body = rows.length
    ? rows.map((p) => `**${esc(p.goal).slice(0, 90)}**\n-# ${p.status} · ${esc(p.domain)} · risk ${p.risk} · ${new Date(p.created_at).toISOString().slice(0, 16)}Z`).join('\n\n')
    : 'No pending proposals.';
  return { flags: V2, components: [panel({ title: `AZURE · ${KINDS.approvals}`, body, footer: 'Pending proposals awaiting owner decision', buttons: controls('approvals') })] };
}

export function policiesPanel(rows) {
  const body = rows.length
    ? rows.map((p) => `**${esc(p.domain)}** → \`${p.level}\``).join('\n')
    : 'No autonomy policies configured (defaults apply).';
  return { flags: V2, components: [panel({ title: `AZURE · ${KINDS.policies}`, body, footer: 'Set per-domain autonomy via the policies store', buttons: controls('policies') })] };
}

export function memoryPanel(data) {
  const body = [
    `**Enabled:** ${data.enabled ? 'yes' : 'no (set EMBED_API_KEY)'}`,
    `**Model:** ${esc(data.model)} (${data.dimensions}d)`,
    `**Total rows:** ${data.total ?? 0}`,
    ...(data.byKind.length ? [`**By kind:** ${data.byKind.map((k) => `${esc(k.kind)}:${k.count}`).join(' · ')}`] : []),
  ].join('\n');
  const rows = data.recent?.length ? ['**Recent**', ...data.recent.map((m) => `-# ${esc(m.content).slice(0, 120).replace(/\n/g, ' ')}`)] : [];
  return { flags: V2, components: [panel({ title: `AZURE · ${KINDS.memory}`, body: rows.length ? `${body}\n\n${rows.join('\n')}` : body, footer: 'Semantic memories feed RAG context assembly', buttons: controls('memory', [button.danger('adm:wipe:all', 'Wipe All')]) })] };
}

export { KINDS };