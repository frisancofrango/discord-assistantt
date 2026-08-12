import { z } from 'zod';

export const ModelProfileSchema = z.object({
  id: z.string().min(1), endpoint: z.string().url(), apiKey: z.string().optional(), model: z.string().min(1),
  capabilities: z.array(z.string()).min(1), contextWindow: z.number().int().positive(), quality: z.number().min(0).max(1).default(0.5),
  inputCostPerMillion: z.number().nonnegative().default(0), outputCostPerMillion: z.number().nonnegative().default(0),
  latencyMs: z.number().positive().default(3000), priority: z.number().default(0), enabled: z.boolean().default(true), headers: z.record(z.string(), z.string()).default({}),
});

export function parseJson(text, schema) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value;
  try { value = JSON.parse(cleaned); } catch (cause) { throw new Error('Model returned invalid JSON', { cause }); }
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`Model response failed schema validation: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return result.data;
}

export class ModelRouter {
  constructor(profiles, options = {}) {
    this.profiles = z.array(ModelProfileSchema).parse(profiles); this.fetch = options.fetch ?? globalThis.fetch;
    this.failureThreshold = options.failureThreshold ?? 3; this.resetMs = options.circuitResetMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2; this.budgetUsd = options.budgetUsd ?? Infinity; this.spent = 0;
    this.health = new Map(this.profiles.map((p) => [p.id, { failures: 0, openedAt: 0, calls: 0, latencyMs: p.latencyMs }]));
    this.telemetry = options.telemetry ?? (() => {}); this.recordUsage = options.recordUsage ?? (async () => {});
  }
  candidates(request, excluded = new Set()) {
    const now = Date.now();
    return this.profiles.filter((p) => p.enabled && !excluded.has(p.id) && p.capabilities.includes(request.capability) && p.contextWindow >= request.contextTokens)
      .filter((p) => { const h = this.health.get(p.id); return !h.openedAt || now - h.openedAt >= this.resetMs; })
      .map((p) => { const h = this.health.get(p.id); const contextFit = 1 - request.contextTokens / p.contextWindow; const cost = p.inputCostPerMillion + p.outputCostPerMillion; const score = p.quality * 55 + contextFit * 15 + p.priority * 5 - Math.log10(1 + cost) * 10 - Math.log10(1 + h.latencyMs) * 5; return { p, score }; })
      .sort((a, b) => b.score - a.score).map((v) => v.p);
  }
  async complete(request) {
    const excluded = new Set(); let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const profile = this.candidates(request, excluded)[0];
      if (!profile) break; excluded.add(profile.id);
      const started = performance.now();
      try {
        const response = await this.fetch(`${profile.endpoint.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(request.timeoutMs ?? 60_000), headers: { 'content-type': 'application/json', ...(profile.apiKey ? { authorization: `Bearer ${profile.apiKey}` } : {}), ...profile.headers }, body: JSON.stringify({ model: profile.model, messages: request.messages, temperature: request.temperature ?? 0.1, response_format: request.json ? { type: 'json_object' } : undefined }) });
        if (!response.ok) throw new Error(`Model endpoint returned ${response.status}`);
        const body = await response.json(); const content = body.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('Model response had no content');
        const usage = body.usage ?? {}; const costUsd = ((usage.prompt_tokens ?? 0) * profile.inputCostPerMillion + (usage.completion_tokens ?? 0) * profile.outputCostPerMillion) / 1_000_000;
        if (this.spent + costUsd > this.budgetUsd) throw new Error('Model budget exceeded');
        this.spent += costUsd; this.success(profile.id, performance.now() - started);
        const record = { profileId: profile.id, capability: request.capability, attempt, latencyMs: Math.round(performance.now() - started), inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0, costUsd };
        await this.recordUsage(record); this.telemetry({ event: 'model.complete', ...record });
        return { content, usage: record, profileId: profile.id };
      } catch (error) { lastError = error; this.failure(profile.id); this.telemetry({ event: 'model.failure', profileId: profile.id, capability: request.capability, attempt, error: error.message }); }
    }
    throw lastError ?? new Error('No healthy model profile satisfies capability and context requirements');
  }
  success(id, latency) { const h = this.health.get(id); h.failures = 0; h.openedAt = 0; h.calls++; h.latencyMs = h.latencyMs * 0.8 + latency * 0.2; }
  failure(id) { const h = this.health.get(id); h.failures++; h.calls++; if (h.failures >= this.failureThreshold) h.openedAt = Date.now(); }
  snapshot() { return Object.fromEntries([...this.health].map(([id, h]) => [id, { ...h, circuitOpen: Boolean(h.openedAt && Date.now() - h.openedAt < this.resetMs) }])); }
}
