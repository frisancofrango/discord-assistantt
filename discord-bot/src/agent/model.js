import { z } from 'zod';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ModelProfileSchema = z.object({
  id: z.string().min(1),
  endpoint: z.string().url().default('http://127.0.0.1:4010/v1'),
  apiKey: z.string().optional().default(''),
  model: z.string().min(1),
  capabilities: z.array(z.string()).min(1),
  contextWindow: z.number().int().positive().default(128000),
  quality: z.number().min(0).max(1).default(0.85),
  inputCostPerMillion: z.number().nonnegative().default(0),
  outputCostPerMillion: z.number().nonnegative().default(0),
  latencyMs: z.number().positive().default(800),
  priority: z.number().default(0),
  enabled: z.boolean().default(true),
  headers: z.record(z.string(), z.string()).default({}),
  kind: z.enum(['http', 'cli']).default('http'),
});

/**
 * Built-in OpenCode Free Public Unlimited default profiles.
 * Used when no custom profiles are supplied in environment variables.
 */
export const DEFAULT_OPENCODE_PROFILES = Object.freeze([
  {
    id: 'opencode-proxy-free',
    endpoint: 'http://127.0.0.1:4010/v1',
    apiKey: '',
    model: 'opencode/deepseek-v4-flash-free',
    capabilities: ['conversation', 'planning', 'critic', 'research', 'coding'],
    contextWindow: 128000,
    quality: 0.95,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    latencyMs: 800,
    priority: 10,
    enabled: true,
    headers: {},
    kind: 'http',
  },
  {
    id: 'opencode-zen-free',
    endpoint: 'http://127.0.0.1:3000/v1',
    apiKey: 'sk-opencode-zen-keyless-fake-99999',
    model: 'mimo-v2.5-free',
    capabilities: ['conversation', 'planning', 'critic', 'research', 'coding'],
    contextWindow: 128000,
    quality: 0.9,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    latencyMs: 900,
    priority: 8,
    enabled: true,
    headers: {},
    kind: 'http',
  },
  {
    id: 'opencode-cli-direct',
    endpoint: 'http://127.0.0.1:4010/v1',
    apiKey: '',
    model: 'opencode/deepseek-v4-flash-free',
    capabilities: ['conversation', 'planning', 'critic', 'research', 'coding'],
    contextWindow: 128000,
    quality: 0.85,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    latencyMs: 1200,
    priority: 5,
    enabled: true,
    headers: {},
    kind: 'cli',
  },
]);

export function parseJson(text, schema) {
  const raw = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const candidates = [raw];
  const open = raw.indexOf('{');
  if (open > 0) candidates.push(raw.slice(open));
  if (open >= 0) {
    const close = raw.lastIndexOf('}');
    if (close > open) candidates.push(raw.slice(open, close + 1));
  }
  let lastErr;
  for (const candidate of candidates) {
    let value;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    lastErr = result.error;
  }
  if (lastErr) throw new Error(`Model response failed schema validation: ${lastErr.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  throw new Error('Model returned invalid JSON', { cause: lastErr });
}

export class ModelRouter {
  constructor(profiles, options = {}) {
    const parsedProfiles = profiles && profiles.length ? profiles : DEFAULT_OPENCODE_PROFILES;
    this.profiles = z.array(ModelProfileSchema).parse(parsedProfiles);
    this.fetch = options.fetch ?? globalThis.fetch;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetMs = options.circuitResetMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.budgetUsd = options.budgetUsd ?? Infinity;
    this.spent = 0;
    this.health = new Map(this.profiles.map((p) => [p.id, { failures: 0, openedAt: 0, calls: 0, latencyMs: p.latencyMs }]));
    this.telemetry = options.telemetry ?? (() => {});
    this.recordUsage = options.recordUsage ?? (async () => {});
    this.cliQueue = Promise.resolve();
    this.raceCount = options.raceCount ?? 1;
    this.pacingMs = options.pacingMs ?? 0;
    this.lastAttemptAt = 0;
  }

  candidates(request, excluded = new Set()) {
    const now = Date.now();
    return this.profiles
      .filter((p) => p.enabled && !excluded.has(p.id) && p.capabilities.includes(request.capability) && p.contextWindow >= request.contextTokens)
      .filter((p) => {
        const h = this.health.get(p.id);
        return !h?.openedAt || now - h.openedAt >= this.resetMs;
      })
      .map((p) => {
        const h = this.health.get(p.id) || { latencyMs: p.latencyMs };
        const contextFit = 1 - request.contextTokens / p.contextWindow;
        const cost = p.inputCostPerMillion + p.outputCostPerMillion;
        const score = p.quality * 55 + contextFit * 15 + p.priority * 5 - Math.log10(1 + cost) * 10 - Math.log10(1 + h.latencyMs) * 5;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((v) => v.p);
  }

  async #attemptOne(profile, request, attempt) {
    const started = performance.now();
    try {
      const response = profile.kind === 'cli' ? await this.#completeCli(profile, request) : await this.#completeHttp(profile, request);
      if (this.spent + response.usage.costUsd > this.budgetUsd) throw new Error('Model budget exceeded');
      this.spent += response.usage.costUsd;
      this.success(profile.id, response.usage.latencyMs);
      const record = { profileId: profile.id, capability: request.capability, attempt, ...response.usage };
      try {
        await this.recordUsage(record);
      } catch {}
      this.telemetry({ event: 'model.complete', ...record });
      return { ok: true, value: { content: response.content, usage: record, profileId: profile.id } };
    } catch (error) {
      this.failure(profile.id);
      this.telemetry({ event: 'model.failure', profileId: profile.id, capability: request.capability, attempt, error: error.message });
      return { ok: false, error };
    }
  }

  async completeStream(request, onDelta) {
    const pool = this.candidates(request);
    if (!pool.length) return this.complete(request);
    const httpPool = pool.filter((p) => p.kind === 'http');
    const racers = request.race === false || httpPool.length === 0 ? [pool[0]] : httpPool.slice(0, Math.max(1, Math.min(this.raceCount, httpPool.length)));
    try {
      return racers.length > 1 ? await this.#completeStreamRace(racers, request, onDelta) : await this.#completeStreamOne(racers[0], request, onDelta);
    } catch (error) {
      for (const p of racers) {
        this.failure(p.id);
        this.telemetry({ event: 'model.failure', profileId: p.id, capability: request.capability, attempt: 0, error: error.message });
      }
      return this.complete(request);
    }
  }

  async #completeStreamOne(profile, request, onDelta) {
    const started = performance.now();
    if (profile.kind !== 'http') {
      const result = await this.#attemptOne(profile, request, 0);
      if (!result.ok) throw result.error;
      onDelta?.(result.value.content);
      return result.value;
    }
    let text = '';
    const timeoutMs = request.timeoutMs ?? 15_000;
    const response = await this.fetch(`${profile.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        ...(profile.apiKey ? { authorization: `Bearer ${profile.apiKey}` } : {}),
        ...profile.headers,
      },
      body: JSON.stringify({
        model: profile.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        stream: true,
      }),
    });

    if (!response.ok) throw new Error(`Model endpoint returned ${response.status}`);
    const usage = {};
    if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const body = await response.json();
      text = body.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('Model response had no content');
      Object.assign(usage, body.usage ?? {});
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') break;
          try {
            const event = JSON.parse(payload);
            const delta = event.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              text += delta;
              onDelta?.(delta);
            }
            if (event.usage) Object.assign(usage, event.usage);
          } catch {}
        }
        if (buffer.includes('[DONE]')) break;
      }
    }

    if (!text.trim()) {
      const record = {
        profileId: profile.id,
        capability: request.capability,
        attempt: 0,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        costUsd: 0,
      };
      this.success(profile.id, record.latencyMs);
      try {
        await this.recordUsage(record);
      } catch {}
      this.telemetry({ event: 'model.complete', ...record });
      return { content: '', usage: record, profileId: profile.id };
    }

    const record = {
      profileId: profile.id,
      capability: request.capability,
      attempt: 0,
      latencyMs: Math.round(performance.now() - started),
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      costUsd: 0,
    };
    if (this.spent + record.costUsd > this.budgetUsd) throw new Error('Model budget exceeded');
    this.spent += record.costUsd;
    this.success(profile.id, record.latencyMs);
    try {
      await this.recordUsage(record);
    } catch {}
    this.telemetry({ event: 'model.complete', ...record });
    return { content: text, usage: record, profileId: profile.id };
  }

  async #completeStreamRace(profiles, request, onDelta) {
    const started = performance.now();
    const timeoutMs = request.timeoutMs ?? 15_000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const states = profiles.map((p) => ({ p, controller: new AbortController() }));
    let winner = null,
      text = '',
      usage = {},
      winnerFailed = false;
    const abortLosers = () => {
      for (const st of states)
        if (st !== winner) {
          try {
            st.controller.abort();
          } catch {}
        }
    };
    const pump = async (st) => {
      try {
        const response = await this.fetch(`${st.p.endpoint.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.any([st.controller.signal, timeoutSignal]),
          headers: {
            'content-type': 'application/json',
            ...(st.p.apiKey ? { authorization: `Bearer ${st.p.apiKey}` } : {}),
            ...st.p.headers,
          },
          body: JSON.stringify({
            model: st.p.model,
            messages: request.messages,
            temperature: request.temperature ?? 0.2,
            ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
            stream: true,
          }),
        });
        if (!response.ok) throw new Error(`Model endpoint returned ${response.status}`);
        if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
          const body = await response.json();
          const content = body.choices?.[0]?.message?.content ?? '';
          if (!content) throw new Error('Model response had no content');
          Object.assign(usage, body.usage ?? {});
          if (!winner) {
            winner = st;
            abortLosers();
            text = content;
            onDelta?.(content);
          }
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') break;
            try {
              const event = JSON.parse(payload);
              const delta = event.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta) {
                if (!winner) {
                  winner = st;
                  abortLosers();
                } else if (winner !== st) return;
                text += delta;
                onDelta?.(delta);
              }
              if (event.usage) Object.assign(usage, event.usage);
            } catch {}
          }
          if (buffer.includes('[DONE]')) break;
        }
      } catch (err) {
        if (winner === st) {
          winnerFailed = true;
          throw err;
        }
      }
    };
    await Promise.allSettled(states.map((st) => pump(st)));
    if (!winner || winnerFailed) return this.complete(request);
    const record = {
      profileId: winner.p.id,
      capability: request.capability,
      attempt: 0,
      latencyMs: Math.round(performance.now() - started),
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      costUsd: 0,
    };
    this.success(winner.p.id, record.latencyMs);
    try {
      await this.recordUsage(record);
    } catch {}
    this.telemetry({ event: 'model.complete', ...record });
    return { content: text, usage: record, profileId: winner.p.id };
  }

  async complete(request) {
    const excluded = new Set();
    let lastError;
    const raceN = Math.min(this.raceCount, this.candidates(request).length);
    if (raceN > 1 && request.race !== false) {
      const starters = this.candidates(request).slice(0, raceN);
      starters.forEach((p) => excluded.add(p.id));
      const winner = await new Promise((resolve, reject) => {
        let pending = starters.length;
        let lastError = null;
        for (const p of starters) {
          this.#attemptOne(p, request, 0)
            .then((r) => {
              if (r.ok) resolve(r.value);
              else {
                lastError = r.error;
                if (--pending === 0) reject(lastError);
              }
            })
            .catch((err) => {
              lastError = err;
              if (--pending === 0) reject(lastError);
            });
        }
      });
      return winner;
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const profile = this.candidates(request, excluded)[0];
      if (!profile) break;
      excluded.add(profile.id);
      const result = await this.#attemptOne(profile, request, attempt);
      if (result.ok) return result.value;
      lastError = result.error;
    }
    throw lastError ?? new Error('No healthy model profile satisfies capability and context requirements');
  }

  async #completeHttp(profile, request) {
    const started = performance.now();
    const timeoutMs = request.timeoutMs ?? 15_000;
    const response = await this.fetch(`${profile.endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        ...(profile.apiKey ? { authorization: `Bearer ${profile.apiKey}` } : {}),
        ...profile.headers,
      },
      body: JSON.stringify({
        model: profile.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        response_format: request.json ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) throw new Error(`Model endpoint returned ${response.status}`);
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Model response had no content');
    const usage = body.usage ?? {};
    return {
      content,
      usage: {
        latencyMs: Math.round(performance.now() - started),
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        costUsd: ((usage.prompt_tokens ?? 0) * profile.inputCostPerMillion + (usage.completion_tokens ?? 0) * profile.outputCostPerMillion) / 1_000_000,
      },
    };
  }

  #completeCli(profile, request) {
    const run = () => {
      const since = this.lastAttemptAt ? Date.now() - this.lastAttemptAt : Infinity;
      const wait = since < this.pacingMs ? this.pacingMs - since : 0;
      return (wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve()).then(() => {
        this.lastAttemptAt = Date.now();
        const started = performance.now();
        const prompt =
          request.messages.map((m) => `${m.role.toUpperCase()}:\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n') +
          (request.json ? '\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown fences, no prose, no commentary outside the JSON.' : '');
        return this.#spawnCli(profile, prompt, request.timeoutMs ?? 20_000).then((raw) => {
          let content = '';
          for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try {
              const e = JSON.parse(line);
              if (e.type === 'text' && typeof e.part?.text === 'string') content += e.part.text;
            } catch {}
          }
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
    return mkdtemp(join(tmpdir(), 'loop-cli-')).then((dir) => {
      const file = join(dir, 'prompt.txt');
      return writeFile(file, prompt, 'utf8').then(
        () =>
          new Promise((resolve, reject) => {
            const child = spawn(
              'opencode',
              ['run', '--pure', '--format', 'json', '-m', profile.model, 'Follow the instructions in the attached prompt and answer directly.', '-f', file],
              {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
                env: { ...process.env, CI: '1', NO_COLOR: '1' },
              }
            );
            let stdout = '',
              stderr = '';
            const limit = 4 * 1024 * 1024;
            let textSeen = false;
            let settled = false;
            const settle = (fn, value) => {
              if (settled) return;
              settled = true;
              clearTimeout(firstTimer);
              clearTimeout(hardTimer);
              fn(value);
            };
            child.stdout.on('data', (d) => {
              stdout = (stdout + d).slice(-limit);
              if (!textSeen && /"type":"text"/.test(d)) textSeen = true;
            });
            child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-limit)));
            const firstTimer = setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {}
              settle(reject, new Error(`CLI model produced no output within 3s`));
            }, 3_000);
            const hardTimer = setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {}
              settle(reject, new Error(`CLI model timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            child.on('error', (err) => settle(reject, err?.code === 'EINVAL' ? new Error('ENOENT: opencode not found') : err));
            child.on('close', (code) => {
              rm(dir, { recursive: true, force: true }).catch(() => {});
              if (!textSeen) settle(reject, new Error('CLI model returned no text'));
              else if (code !== 0) settle(reject, new Error(`opencode run exited ${code}: ${stderr.slice(-400)}`));
              else settle(resolve, stdout);
            });
          })
      );
    });
  }

  success(id, latency) {
    const h = this.health.get(id);
    if (!h) return;
    h.failures = 0;
    h.openedAt = 0;
    h.calls++;
    h.latencyMs = h.latencyMs * 0.8 + latency * 0.2;
  }

  failure(id) {
    const h = this.health.get(id);
    if (!h) return;
    h.failures++;
    h.calls++;
    if (h.failures >= this.failureThreshold) h.openedAt = Date.now();
  }

  snapshot() {
    return Object.fromEntries([...this.health].map(([id, h]) => [id, { ...h, circuitOpen: Boolean(h.openedAt && Date.now() - h.openedAt < this.resetMs) }]));
  }
}
