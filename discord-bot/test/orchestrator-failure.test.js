import test from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../src/agent/orchestrator.js';

async function makeOrchestrator({ stepCount = 1, failOnStep = null }) {
  const task = { id: 't', status: 'pending', metadata: {} };
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    id: `s${i + 1}`,
    position: i,
    status: 'pending',
    input: { id: `s${i + 1}`, kind: 'tool', dependsOn: [], verification: { evidenceRequired: true }, input: {} },
  }));
  const repos = {
    tasks: { get: async () => task, update: async (_id, patch) => Object.assign(task, patch) },
    taskSteps: { find: async () => steps, update: async (_id, patch) => Object.assign(steps.find((s) => s.id === _id), patch) },
    taskCheckpoints: { create: async () => {} },
  };
  const workers = {
    tool: async ({ stepId }) => {
      if (failOnStep === stepId) throw new Error(`transient CLI error (${stepId})`);
      return { evidenceId: `evidence:${stepId}` };
    },
  };
  const orchestrator = new Orchestrator({ queue: {}, repositories: repos, workers, logger: {} });
  return { orchestrator, task, steps };
}

test('worker failure marks the step and task failed with persisted error', async () => {
  const { orchestrator, task, steps } = await makeOrchestrator({ failOnStep: 's1' });
  await assert.rejects(() => orchestrator.execute('t', { isCancelled: async () => false, progress: async () => {} }), /transient CLI error \(s1\)/);
  assert.equal(task.status, 'failed');
  const step = steps.find((s) => s.id === 's1');
  assert.equal(step.status, 'failed');
  assert.match(step.error?.message ?? '', /transient CLI error \(s1\)/);
});

test('failure in a later step preserves earlier completed steps for resume', async () => {
  const { orchestrator, steps } = await makeOrchestrator({ stepCount: 3, failOnStep: 's2' });
  await assert.rejects(() => orchestrator.execute('t', { isCancelled: async () => false, progress: async () => {} }), /transient CLI error \(s2\)/);
  assert.equal(steps[0].status, 'completed');
  assert.equal(steps[1].status, 'failed');
  assert.equal(steps[2].status, 'pending');
});

test('cancellation between steps aborts cleanly without persisting failure', async () => {
  const { orchestrator, task, steps } = await makeOrchestrator({ stepCount: 2 });
  let cancelled = false;
  const result = await orchestrator.execute('t', {
    isCancelled: async () => cancelled,
    progress: async () => { cancelled = true; },
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(task.status, 'cancelled');
  assert.equal(steps[0].status, 'completed');
  assert.equal(steps[1].status, 'pending');
});