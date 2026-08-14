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

const SYSTEM = `You are Azure's planner. Return only JSON matching the supplied contract. Build a bounded DAG. Every step needs deterministic preconditions, postconditions, verification and compensation where mutation is possible. Never claim success from model text; require tool evidence. Provider and model identities are confidential.
Keep the plan COMPACT: at most 12 steps. Step titles short, step input objects terse (never repeat long prose, truncate topics/descriptions). The full response must stay well under 4000 characters.`;

const compactSnapshot = (snap) => ({
  serverName: snap?.serverName ?? null,
  memberCount: snap?.memberCount ?? 0,
  channels: (snap?.channels ?? []).slice(0, 25).map((c) => ({ id: c.id, name: c.name ?? c.name, type: c.type ?? 'text', position: c.position ?? null, topic: c.topic ? String(c.topic).slice(0, 60) : null })),
  roles: (snap?.roles ?? []).slice(0, 25).map((r) => ({ id: r.id, name: r.name })),
  members: (snap?.members ?? []).slice(0, 40).map((mm) => ({ id: mm.id, name: mm.displayName ?? mm.name })),
  bans: (snap?.bans ?? []).slice(0, 10),
});

const normalizeDomain = (d) => {
  if (typeof d !== 'string') return 'server_design';
  const l = d.toLowerCase();
  return DOMAINS.find((x) => l.includes(x) || x.includes(l)) ?? 'server_design';
};

const tolerantPlan = (loose, observedAt) => ({
  ...loose,
  contextObservedAt: loose?.contextObservedAt ?? observedAt,
  domain: normalizeDomain(loose?.domain),
});

const EXAMPLE_PLAN = {
  goal: 'make a welcome channel with a rules message',
  contextObservedAt: '2026-08-14T10:00:00.000Z',
  domain: 'server_design',
  risk: 'low',
  assumptions: ['the guild id in inputs comes from the snapshot'],
  steps: [
    {
      id: 'welcome_channel', kind: 'tool', title: 'Create #welcome channel', domain: 'server_design', risk: 'low',
      dependsOn: [], input: { tool: 'channel.create', arguments: { guildId: 'GUILD_ID_FROM_SNAPSHOT', name: 'welcome', type: 0, topic: 'new here? start reading' }, stage: 1, requiredPermissions: ['ManageChannels'] },
      preconditions: [], postconditions: [{ description: 'welcome channel exists', check: 'channel visible in snapshot' }],
      verification: { method: 'channel exists after execution', evidenceRequired: true }, compensation: { action: 'delete the created channel' },
    },
    {
      id: 'rules_message', kind: 'tool', title: 'Post rules message', domain: 'server_design', risk: 'low',
      dependsOn: ['welcome_channel'], input: { tool: 'message.send', arguments: { channelId: 'CHANNEL_ID_CREATED_ABOVE', content: '1. no scamming 2. be cool', components: [] }, stage: 2, requiredPermissions: ['SendMessages'] },
      preconditions: [], postconditions: [{ description: 'message posted', check: 'composer receipt evidence' }],
      verification: { method: 'composer evidence id', evidenceRequired: true }, compensation: { action: 'delete the message' },
    },
  ],
};
const CRITIC = `Review this high-risk plan for safety, missing evidence, rollback, authorization, budgets and dependency errors. Return JSON: {"approved":boolean,"concerns":string[],"reviewedAt":ISO timestamp}.`;
export class Planner {
  constructor(router, repositories) { this.router = router; this.repositories = repositories; }
  async create({ goal, context, guildId, actorId, idempotencyKey }) {
    if (!context?.observedAt) throw new Error('Fresh observed context is required');
    const freshContext = { observedAt: context.observedAt, guildSnapshot: compactSnapshot(context.guildSnapshot) };
    let plan = null;
    let attemptHints = '';
    let lastResponse = null;
    for (let attempt = 0; attempt < 3 && !plan; attempt++) {
      const userJson = JSON.stringify({ goal, freshContext, contract: 'PlanSchema', example: EXAMPLE_PLAN, note: 'CLONE the example JSON shape EXACTLY: same field names, same nesting, tool names from the example (channel.create, role.create, message.send, guild.edit, channel.edit, member.roles, message.react). Replace placeholders with real values from freshContext. Keep the plan COMPACT: at most 10 steps.' });
      const hints = attempt ? ` Correct your previous JSON: ${attemptHints}` : '';
      const response = await this.router.complete({ capability: 'planning', contextTokens: Math.ceil((JSON.stringify(freshContext).length + userJson.length) / 4), json: true, messages: [{ role:'system', content:SYSTEM }, { role:'user', content:userJson + hints }] });
      lastResponse = response;
      let validate = (text) => parseJson(text, PlanSchema);
      if (attempt > 0) {
        validate = (text) => {
          const loose = parseJson(text, z.record(z.unknown()));
          return PlanSchema.parse(tolerantPlan(loose, freshContext.observedAt));
        };
      }
      try {
        plan = validate(response.content);
        if (plan.risk === 'high') {
          const review = await this.router.complete({ capability:'critic', contextTokens: JSON.stringify(plan).length / 4, json:true, messages:[{role:'system',content:CRITIC},{role:'user',content:JSON.stringify(plan)}] });
          const critic = parseJson(review.content, z.object({ approved:z.boolean(), concerns:z.array(z.string()), reviewedAt:z.string().datetime() }));
          plan = PlanSchema.parse({ ...plan, critic });
          if (!critic.approved) throw new Error(`critic rejected: ${critic.concerns.join('; ')}`);
        }
      } catch (err) {
        attemptHints = String(err?.issues?.map?.((i) => `${i.path.join('.')}: ${i.message}`).join('; ') ?? err?.message ?? err);
      }
    }
    if (!plan) throw new Error('Model returned invalid JSON');
    const task = await this.repositories.tasks.create({ guild_id:guildId, actor_id:actorId, domain:plan.domain, risk:plan.risk, status:'pending', goal, idempotency_key:idempotencyKey, metadata:{ plan, modelUsage:lastResponse?.usage, checkpoint:{ completed:[] } } });
    for (let i=0;i<plan.steps.length;i++) await this.repositories.taskSteps.create({ task_id:task.id, position:i, kind:plan.steps[i].kind, status:'pending', input:plan.steps[i] });
    return { task, plan };
  }
}
