import { z } from 'zod';
import { DOMAINS, RISKS } from '../foundation/policy.js';
import { parseJson } from './model.js';

const Condition = z.object({ description: z.string().min(1), check: z.string().min(1) });
export const PlanStepSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/), kind: z.enum(['research','code','tool','verify','synthesize']), title: z.string().min(1),
  domain: z.enum(DOMAINS), risk: z.enum(RISKS), dependsOn: z.array(z.string()).default([]), input: z.record(z.string(), z.unknown()).default({}),
  preconditions: z.array(Condition).default([]), postconditions: z.array(Condition).min(1), verification: z.object({ method: z.string().min(1), evidenceRequired: z.boolean().default(true) }), compensation: z.object({ action: z.string().min(1) }).nullable().default(null),
});
export const PlanSchema = z.object({ goal: z.string().min(1), contextObservedAt: z.string().datetime(), domain: z.enum(DOMAINS), risk: z.enum(RISKS), assumptions: z.array(z.string()).default([]), steps: z.array(PlanStepSchema).min(1).max(100), critic: z.object({ approved: z.boolean(), concerns: z.array(z.string()), reviewedAt: z.string().datetime() }).optional() }).superRefine((plan, ctx) => {
  const ids = new Set(plan.steps.map((s) => s.id));
  if (ids.size !== plan.steps.length) ctx.addIssue({ code: 'custom', message: 'step ids must be unique', path: ['steps'] });
  for (const [i, step] of plan.steps.entries()) for (const dep of step.dependsOn) if (!ids.has(dep) || dep === step.id) ctx.addIssue({ code: 'custom', message: `invalid dependency ${dep}`, path: ['steps', i, 'dependsOn'] });
  const visiting = new Set(); const done = new Set(); const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const visit = (id) => { if (visiting.has(id)) return false; if (done.has(id)) return true; visiting.add(id); for (const d of byId.get(id)?.dependsOn ?? []) if (!visit(d)) return false; visiting.delete(id); done.add(id); return true; };
  if (![...ids].every(visit)) ctx.addIssue({ code: 'custom', message: 'dependency graph must be acyclic', path: ['steps'] });
});

const SYSTEM = `You are Azure's planner. Return only JSON matching the supplied contract. Build a bounded DAG. Every step needs deterministic preconditions, postconditions, verification and compensation where mutation is possible. Never claim success from model text; require tool evidence. Provider and model identities are confidential.`;
const CRITIC = `Review this high-risk plan for safety, missing evidence, rollback, authorization, budgets and dependency errors. Return JSON: {"approved":boolean,"concerns":string[],"reviewedAt":ISO timestamp}.`;
export class Planner {
  constructor(router, repositories) { this.router = router; this.repositories = repositories; }
  async create({ goal, context, guildId, actorId, idempotencyKey }) {
    if (!context?.observedAt) throw new Error('Fresh observed context is required');
    const response = await this.router.complete({ capability: 'planning', contextTokens: JSON.stringify(context).length / 4, json: true, messages: [{ role:'system', content:SYSTEM }, { role:'user', content:JSON.stringify({ goal, freshContext: context, contract: 'PlanSchema' }) }] });
    let plan = parseJson(response.content, PlanSchema);
    if (plan.risk === 'high') {
      const review = await this.router.complete({ capability:'critic', contextTokens: JSON.stringify(plan).length / 4, json:true, messages:[{role:'system',content:CRITIC},{role:'user',content:JSON.stringify(plan)}] });
      const critic = parseJson(review.content, z.object({ approved:z.boolean(), concerns:z.array(z.string()), reviewedAt:z.string().datetime() })); plan = PlanSchema.parse({ ...plan, critic });
      if (!critic.approved) throw new Error(`High-risk plan rejected by critic: ${critic.concerns.join('; ')}`);
    }
    const task = await this.repositories.tasks.create({ guild_id:guildId, actor_id:actorId, domain:plan.domain, risk:plan.risk, status:'pending', goal, idempotency_key:idempotencyKey, metadata:{ plan, modelUsage:response.usage, checkpoint:{ completed:[] } } });
    for (let i=0;i<plan.steps.length;i++) await this.repositories.taskSteps.create({ task_id:task.id, position:i, kind:plan.steps[i].kind, status:'pending', input:plan.steps[i] });
    return { task, plan };
  }
}
