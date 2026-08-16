import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentRuntime } from '../src/agent/runtime.js';

function makeRuntime(overrides = {}) {
  const config = {
    models: {
      profiles: [{
        id: 'dead-end', endpoint: 'http://127.0.0.1:9', apiKey: 'k', model: 'm',
        capabilities: ['conversation'], contextWindow: 128_000, quality: 0.5,
        inputCostPerMillion: 0, outputCostPerMillion: 0, latencyMs: 1, priority: 0, enabled: true,
      }],
      maxRetries: 0, failureThreshold: 9,
    },
    research: { maxBytes: 64_000, timeoutMs: 1000, allowedTypes: ['text/plain'], allowedHosts: [] },
    code: { workspaceRoot: '/tmp', validationCommands: [] },
    ...overrides,
  };
  const repositories = {
    modelUsage: { create: async () => {} }, evidence: { create: async () => {} },
    tasks: {}, taskSteps: {}, taskCheckpoints: {},
  };
  const queue = {};
  const logger = { info: () => {}, error: () => {}, debug: () => {} };
  return createAgentRuntime({ config, repositories, queue, logger });
}

test('converse replies with a graceful fallback when the model endpoint is unreachable', async () => {
  const runtime = makeRuntime();
  const message = { id: '1', author: { id: '2' }, content: 'hi loop', editedAt: null };
  const content = await runtime.converse({ message, context: { estimatedTokens: 100, channels: [] }, decision: { reason: 'name_mention' } });
  assert.equal(typeof content, 'string');
  assert.match(content, /i\u2019m alive/i);
  await runtime.close();
});