import { createHash, randomBytes } from 'node:crypto';
import { diffSnapshots, snapshotHash } from '../discord/snapshot.js';

const RISK_WEIGHT = { read: 0, low: 1, medium: 3, high: 8, forbidden: 100 };
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
export const stableHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function toolSteps(plan) {
  return plan.steps.filter((step) => step.kind === 'tool').map((step, position) => ({
    id: step.id, stage: step.input.stage ?? position + 1, title: step.title, tool: step.input.tool,
    input: step.input.arguments ?? step.input.input ?? {}, dependsOn: [...step.dependsOn], risk: step.risk,
    domain: step.domain, requiredPermissions: step.input.requiredPermissions ?? [],
    irreversible: Boolean(step.input.irreversible || step.compensation == null),
    postconditions: step.postconditions, verification: step.verification, compensation: step.compensation,
  }));
}
function estimate(steps, config = {}) {
  const costPerStep = config.costPerStepUsd ?? 0.01;
  const secondsPerStep = config.secondsPerStep ?? 2;
  const score = steps.reduce((sum, step) => sum + (RISK_WEIGHT[step.risk] ?? 8), 0);
  return { costUsd: Number((steps.length * costPerStep).toFixed(4)), durationSeconds: Math.max(1, steps.length * secondsPerStep), riskScore: score, risk: score >= 16 ? 'high' : score >= 6 ? 'medium' : score ? 'low' : 'read' };
}
function tier(name, description, steps, config) {
  return { id: name.toLowerCase().replace(/\W+/g, '-'), name, description, steps, estimates: estimate(steps, config), requiredPermissions: [...new Set(steps.flatMap((s) => s.requiredPermissions))].sort(), irreversibleWarnings: steps.filter((s) => s.irreversible).map((s) => `${s.title} cannot be automatically restored.`) };
}

export function buildProposal({ task, plan, beforeSnapshot, desiredSnapshot = null, tierCount = 3, estimateConfig = {} }) {
  if (!beforeSnapshot?.capturedAt || !beforeSnapshot?.guild?.id) throw new Error('A fresh guild snapshot is required');
  if (tierCount < 2 || tierCount > 3) throw new RangeError('tierCount must be 2 or 3');
  const executable = toolSteps(plan);
  if (!executable.length) throw new Error('Plan contains no executable tool steps');
  const lowRisk = executable.filter((s) => ['read', 'low'].includes(s.risk));
  const reversible = executable.filter((s) => !s.irreversible);
  const tiers = [tier('Essential', 'Smallest safe reversible change set.', lowRisk.length ? lowRisk : reversible.slice(0, Math.max(1, Math.ceil(reversible.length / 2))), estimateConfig)];
  if (tierCount === 3) tiers.push(tier('Balanced', 'Recommended scope with reversible improvements.', reversible.length ? reversible : executable.filter((s) => s.risk !== 'high'), estimateConfig));
  tiers.push(tier('Complete', 'Full planned transformation, including all disclosed risk.', executable, estimateConfig));
  const diff = desiredSnapshot ? diffSnapshots(beforeSnapshot, desiredSnapshot) : {
    fromGuildId: beforeSnapshot.guild.id, toGuildId: beforeSnapshot.guild.id, hasChanges: true,
    changes: executable.map((s) => ({ op: 'tool', path: `/stages/${s.stage}/${s.id}`, before: null, after: { tool: s.tool, input: canonical(s.input) } })),
  };
  const body = { taskId: task.id, guildId: beforeSnapshot.guild.id, goal: plan.goal, domain: plan.domain, risk: plan.risk, beforeSnapshotHash: snapshotHash(beforeSnapshot), beforeCapturedAt: beforeSnapshot.capturedAt, diff, tiers, selectedTierId: tiers.at(-1).id };
  return { ...body, revision: 1, status: 'pending', contentHash: stableHash(body), machinePlan: { version: 1, steps: executable } };
}

export function reviseProposal(proposal, patch) {
  if (!['pending', 'changes_requested'].includes(proposal.status)) throw new Error('Only open proposals can be revised');
  const allowed = { selectedTierId: patch.selectedTierId ?? proposal.selectedTierId, tiers: patch.tiers ?? proposal.tiers, diff: patch.diff ?? proposal.diff, machinePlan: patch.machinePlan ?? proposal.machinePlan };
  if (!allowed.tiers.some((t) => t.id === allowed.selectedTierId)) throw new Error('Selected tier does not exist');
  const next = { ...proposal, ...allowed, revision: proposal.revision + 1, status: 'pending' };
  next.contentHash = stableHash({ taskId: next.taskId, guildId: next.guildId, goal: next.goal, domain: next.domain, risk: next.risk, beforeSnapshotHash: next.beforeSnapshotHash, beforeCapturedAt: next.beforeCapturedAt, diff: next.diff, tiers: next.tiers, selectedTierId: next.selectedTierId });
  return next;
}

export const createOpaqueToken = () => randomBytes(32).toString('base64url');
export const hashApprovalToken = (token, pepper = '') => createHash('sha256').update(`${pepper}:${token}`).digest('hex');

export function humanizeProposal(proposal) {
  const tier = proposal.tiers.find((item) => item.id === proposal.selectedTierId);
  const changes = proposal.diff.changes.slice(0, 12).map((change) => `• **${change.op}** \`${change.path}\``).join('\n');
  return { title: `AZURE PROPOSAL · R${proposal.revision}`, subtitle: proposal.goal, body: `**Selected:** ${tier.name}\n**Estimate:** $${tier.estimates.costUsd.toFixed(2)} · ${tier.estimates.durationSeconds}s · ${tier.estimates.risk} risk\n**Permissions:** ${tier.requiredPermissions.join(', ') || 'None'}\n\n**Normalized diff**\n${changes || 'No changes'}${proposal.diff.changes.length > 12 ? `\n• … ${proposal.diff.changes.length - 12} more` : ''}${tier.irreversibleWarnings.length ? `\n\n**Irreversible warnings**\n${tier.irreversibleWarnings.map((x) => `• ${x}`).join('\n')}` : ''}`, footer: `Proposal ${proposal.id ?? 'pending'} · approval is bound to this exact revision.` };
}
