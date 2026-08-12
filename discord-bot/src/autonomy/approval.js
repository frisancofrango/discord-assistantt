import { createOpaqueToken, hashApprovalToken } from './proposal.js';

const RANK = { advisor: 0, operator: 1, autopilot: 2, developer: 3 };
export function evaluateApprovalPolicy({ proposal, actor, policy = {}, budget = {} }) {
  if (!actor?.authenticated || actor.bot || actor.guildId !== proposal.guildId) return { allowed: false, escalate: false, reason: 'unauthorized_actor' };
  const domain = policy.domains?.[proposal.domain] ?? policy.default ?? { autonomy: 'advisor' };
  const canApprove = actor.isOwner || domain.approverIds?.includes(actor.id) || policy.guildApproverIds?.includes(actor.id);
  if (!canApprove) return { allowed: false, escalate: true, reason: 'owner_or_delegated_approver_required' };
  if (proposal.risk === 'forbidden') return { allowed: false, escalate: false, reason: 'forbidden_risk' };
  if (proposal.risk === 'high' && !actor.isOwner && domain.ownerOnlyHighRisk !== false) return { allowed: false, escalate: true, reason: 'high_risk_owner_approval_required' };
  if ((RANK[domain.autonomy ?? 'advisor'] ?? 0) < (proposal.risk === 'high' ? 1 : 0)) return { allowed: false, escalate: true, reason: 'autonomy_level_too_low' };
  const tier = proposal.tiers.find((item) => item.id === proposal.selectedTierId);
  const limit = Number(budget.limit ?? domain.budgetUsd ?? Infinity), spent = Number(budget.spent ?? 0), reserved = Number(budget.reserved ?? 0);
  if (spent + reserved + tier.estimates.costUsd > limit) return { allowed: false, escalate: true, reason: 'budget_exceeded' };
  return { allowed: true, escalate: false, reason: 'allowed', tier, budgetRequired: tier.estimates.costUsd };
}

export class ApprovalService {
  constructor({ store, pepper = '', ttlMs = 15 * 60_000, now = () => new Date() }) { Object.assign(this, { store, pepper, ttlMs, now }); }
  async issue({ proposal, actorId }) {
    const token = createOpaqueToken();
    const record = await this.store.createApprovalToken({ proposalId: proposal.id, proposalRevision: proposal.revision, actorId, guildId: proposal.guildId, tokenHash: hashApprovalToken(token, this.pepper), expiresAt: new Date(this.now().getTime() + this.ttlMs) });
    return { token, expiresAt: record.expiresAt ?? record.expires_at };
  }
  async decide({ token, proposal, actor, decision, selectedStepIds = [], reason = null, policy, budget }) {
    if (!['approve_all', 'approve_partial', 'reject', 'request_changes'].includes(decision)) throw new Error('Invalid approval decision');
    const tokenHash = hashApprovalToken(token, this.pepper);
    return this.store.transaction(async (tx) => {
      const grant = await tx.lockApprovalToken(tokenHash);
      if (!grant || grant.consumedAt || grant.consumed_at) throw new Error('Approval token is invalid or was already used');
      if (new Date(grant.expiresAt ?? grant.expires_at) <= this.now()) throw new Error('Approval token expired');
      if (String(grant.proposalId ?? grant.proposal_id) !== String(proposal.id) || Number(grant.proposalRevision ?? grant.proposal_revision) !== proposal.revision || String(grant.actorId ?? grant.actor_id) !== actor.id || String(grant.guildId ?? grant.guild_id) !== proposal.guildId) throw new Error('Approval token binding mismatch');
      const authorization = evaluateApprovalPolicy({ proposal, actor, policy, budget });
      if (!authorization.allowed && decision.startsWith('approve')) throw Object.assign(new Error(authorization.reason), { escalation: authorization.escalate });
      const available = new Set(proposal.machinePlan.steps.map((step) => step.id));
      const approvedStepIds = decision === 'approve_all' ? [...available] : decision === 'approve_partial' ? [...new Set(selectedStepIds)] : [];
      if (decision === 'approve_partial' && (!approvedStepIds.length || approvedStepIds.some((id) => !available.has(id)))) throw new Error('Partial approval contains invalid steps');
      for (const id of approvedStepIds) {
        const step = proposal.machinePlan.steps.find((s) => s.id === id);
        if (!step.dependsOn.every((dep) => approvedStepIds.includes(dep))) throw new Error(`Partial approval omits dependency ${step.dependsOn.find((dep) => !approvedStepIds.includes(dep))}`);
      }
      await tx.consumeApprovalToken(grant.id, { decision, actorId: actor.id });
      return tx.recordProposalDecision({ proposalId: proposal.id, revision: proposal.revision, actorId: actor.id, guildId: actor.guildId, decision, approvedStepIds, reason, authorization });
    });
  }
}
