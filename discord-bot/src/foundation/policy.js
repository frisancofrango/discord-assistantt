export const DOMAINS = Object.freeze(['conversation','moderation','server_design','support','verification','commerce','marketing','research','coding','analytics']);
export const LEVELS = Object.freeze(['advisor','operator','autopilot','developer']);
export const RISKS = Object.freeze(['read','low','medium','high','forbidden']);
const forbidden = new Set(['credential_theft','malware','evasion','unsolicited_spam','fake_engagement','self_bot','impersonate_user']);
const rank = { advisor: 0, operator: 1, autopilot: 2, developer: 3 };

export function evaluatePolicy(input) {
  const { domain, autonomy = 'advisor', risk, behavior, actor = {}, budget, approval, deployment = false } = input;
  if (!DOMAINS.includes(domain) || !LEVELS.includes(autonomy) || !RISKS.includes(risk)) return deny('invalid_policy_input');
  if (risk === 'forbidden' || forbidden.has(behavior)) return deny('forbidden_behavior');
  if (!actor.authenticated || !actor.guildMember) return deny('unauthorized_actor');
  if (actor.bot || actor.selfBot) return deny('bot_actor_not_authorized');
  if (input.requiredPermissions?.some((p) => !actor.permissions?.includes(p)) && !actor.isOwner) return deny('missing_discord_permission');
  if (deployment && !approval?.approvedByOwner) return approvalRequired('code_deployment_owner_approval');
  if (budget && Number(budget.spent) + Number(budget.cost ?? 0) > Number(budget.limit)) return deny('budget_exceeded');
  if (approval?.status === 'denied' || (approval?.expiresAt && new Date(approval.expiresAt) <= new Date())) return deny('approval_denied_or_expired');
  if (autonomy === 'advisor' && risk !== 'read') return approvalRequired('advisor_may_only_inspect');
  if (autonomy === 'operator' && ['medium','high'].includes(risk) && approval?.status !== 'approved') return approvalRequired('operator_risk_requires_approval');
  if (risk === 'high' && approval?.status !== 'approved') return approvalRequired('high_risk_requires_approval');
  if (domain === 'marketing' && !input.consent) return deny('marketing_requires_consent');
  if (domain === 'commerce' && risk !== 'read' && !input.confirmedFinancialScope) return approvalRequired('financial_scope_requires_confirmation');
  if (rank[autonomy] < 2 && input.bulk) return approvalRequired('bulk_action_requires_approval');
  return { allowed: true, requiresApproval: false, reason: 'allowed' };
}
const deny = (reason) => ({ allowed: false, requiresApproval: false, reason });
const approvalRequired = (reason) => ({ allowed: false, requiresApproval: true, reason });
export const FORBIDDEN_BEHAVIORS = Object.freeze([...forbidden]);

const confirmations = new Map();

export function createConfirmation(data, ttlMs = 120000) {
  const token = Math.random().toString(36).slice(2, 12);
  confirmations.set(token, { ...data, expiresAt: Date.now() + ttlMs });
  setTimeout(() => confirmations.delete(token), ttlMs).unref?.();
  return token;
}

export function consume(token) {
  const data = confirmations.get(token);
  if (!data) return null;
  confirmations.delete(token);
  if (data.expiresAt < Date.now()) return null;
  return data;
}

