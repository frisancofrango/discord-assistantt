import { z } from 'zod';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ModelProfileSchema = z.object({
  id: z.string().min(1), endpoint: z.string().url(), apiKey: z.string().optional(), model: z.string().min(1),
  capabilities: z.array(z.string()).min(1), contextWindow: z.number().int().positive(), quality: z.number().min(0).max(1).default(0.5),
  inputCostPerMillion: z.number().nonnegative().default(0), outputCostPerMillion: z.number().nonnegative().default(0),
  latencyMs: z.number().positive().default(3000), priority: z.number().default(0), enabled: z.boolean().default(true), headers: z.record(z.string(), z.string()).default({}),
  kind: z.enum(['http', 'cli']).default('http'),
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
    this.cliQueue = Promise.resolve();
    this.pacingMs = options.pacingMs ?? 35_000; this.lastAttemptAt = 0;
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
        const response = profile.kind === 'cli' ? await this.#completeCli(profile, request) : await this.#completeHttp(profile, request);
        if (this.spent + response.usage.costUsd > this.budgetUsd) throw new Error('Model budget exceeded');
        this.spent += response.usage.costUsd; this.success(profile.id, response.usage.latencyMs);
        const record = { profileId: profile.id, capability: request.capability, attempt, ...response.usage };
        await this.recordUsage(record); this.telemetry({ event: 'model.complete', ...record });
        return { content: response.content, usage: record, profileId: profile.id };
      } catch (error) { lastError = error; this.failure(profile.id); this.telemetry({ event: 'model.failure', profileId: profile.id, capability: request.capability, attempt, error: error.message }); }
    }
    throw lastError ?? new Error('No healthy model profile satisfies capability and context requirements');
  }
  async #completeHttp(profile, request) {
    const started = performance.now();
    const response = await this.fetch(`${profile.endpoint.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(request.timeoutMs ?? 60_000), headers: { 'content-type': 'application/json', ...(profile.apiKey ? { authorization: `Bearer ${profile.apiKey}` } : {}), ...profile.headers }, body: JSON.stringify({ model: profile.model, messages: request.messages, temperature: request.temperature ?? 0.1, response_format: request.json ? { type: 'json_object' } : undefined }) });
    if (!response.ok) throw new Error(`Model endpoint returned ${response.status}`);
    const body = await response.json(); const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Model response had no content');
    const usage = body.usage ?? {};
    return { content, usage: { latencyMs: Math.round(performance.now() - started), inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0, costUsd: ((usage.prompt_tokens ?? 0) * profile.inputCostPerMillion + (usage.completion_tokens ?? 0) * profile.outputCostPerMillion) / 1_000_000 } };
  }
  #completeCli(profile, request) {
    const run = () => {
      const since = this.lastAttemptAt ? Date.now() - this.lastAttemptAt : Infinity;
      const wait = since < this.pacingMs ? this.pacingMs - since : 0;
      return (wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve()).then(() => {
        this.lastAttemptAt = Date.now();
        const started = performance.now();
        const prompt = request.messages.map((m) => `${m.role.toUpperCase()}:\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n') + (request.json ? '\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown fences, no prose, no commentary outside the JSON.' : '');
        return this.#spawnCli(profile, prompt, request.timeoutMs ?? 120_000).then((raw) => {
          let content = '';
          for (const line of raw.split('\n')) { if (!line.trim()) continue; try { const e = JSON.parse(line); if (e.type === 'text' && typeof e.part?.text === 'string') content += e.part.text; } catch {} }
          content = content.trim();
          if (!content) throw new Error('CLI model returned no text');
          return { content, usage: { latencyMs: Math.round(performance.now() - started), inputTokens: 0, outputTokens: Math.ceil(content.length / 4), costUsd: 0 } };
        });
      });
    };
    const p = this.cliQueue.then(run, run);
    this.cliQueue = p.catch(() => {});
    return p;
  }
  #spawnCli(profile, prompt, timeoutMs) {
    return mkdtemp(join(tmpdir(), 'azure-cli-')).then((dir) => {
      const file = join(dir, 'prompt.txt');
      return writeFile(file, prompt, 'utf8').then(() => new Promise((resolve, reject) => {
        const child = spawn('opencode', ['run', '--pure', '--format', 'json', '-m', profile.model, 'Follow the instructions in the attached prompt and answer directly.', '-f', file], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, CI: '1', NO_COLOR: '1' } });
        let stdout = '', stderr = ''; const limit = 4 * 1024 * 1024; let textSeen = false; let settled = false;
        const settle = (fn, value) => { if (settled) return; settled = true; clearTimeout(firstTimer); clearTimeout(hardTimer); fn(value); };
        child.stdout.on('data', (d) => { stdout = (stdout + d).slice(-limit); if (!textSeen && /"type":"text"/.test(d)) textSeen = true; });
        child.stderr.on('data', (d) => stderr = (stderr + d).slice(-limit));
        const firstTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} settle(reject, new Error(`CLI model produced no output within 30s`)); }, 30_000);
        const hardTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} settle(reject, new Error(`CLI model timed out after ${timeoutMs}ms`)); }, timeoutMs);
        child.on('error', (err) => settle(reject, err));
        child.on('close', (code) => { rm(dir, { recursive: true, force: true }).catch(() => {}); if (!textSeen) settle(reject, new Error('CLI model returned no text')); else if (code !== 0) settle(reject, new Error(`opencode run exited ${code}: ${stderr.slice(-400)}`)); else settle(resolve, stdout); });
      }));
    });
  }
  success(id, latency) { const h = this.health.get(id); h.failures = 0; h.openedAt = 0; h.calls++; h.latencyMs = h.latencyMs * 0.8 + latency * 0.2; }
  failure(id) { const h = this.health.get(id); h.failures++; h.calls++; if (h.failures >= this.failureThreshold) h.openedAt = Date.now(); }
  snapshot() { return Object.fromEntries([...this.health].map(([id, h]) => [id, { ...h, circuitOpen: Boolean(h.openedAt && Date.now() - h.openedAt < this.resetMs) }])); }
}
