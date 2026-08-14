import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter } from '../src/agent/model.js';
const profile=(id,quality=0.5)=>({id,endpoint:'https://models.invalid/v1',model:'configured',capabilities:['planning'],contextWindow:10000,quality,latencyMs:100,inputCostPerMillion:1,outputCostPerMillion:1});
const ok=(text='{}')=>({ok:true,json:async()=>({choices:[{message:{content:text}}],usage:{prompt_tokens:10,completion_tokens:5}})});
test('router scores capability/context and records usage',async()=>{let used;const r=new ModelRouter([profile('low',.2),profile('high',.9)],{fetch:async()=>ok(),recordUsage:async(u)=>used=u});const out=await r.complete({capability:'planning',contextTokens:100,messages:[]});assert.equal(out.profileId,'high');assert.equal(used.profileId,'high');});
test('router falls back to a distinct profile',async()=>{const calls=[];const r=new ModelRouter([profile('a',.9),profile('b',.8)],{maxRetries:1,fetch:async(_u,o)=>{calls.push(JSON.parse(o.body).model);return calls.length===1?{ok:false,status:503}:ok('done')}});assert.equal((await r.complete({capability:'planning',contextTokens:1,messages:[]})).content,'done');assert.equal(calls.length,2);});
test('circuit breaker opens after threshold',async()=>{const r=new ModelRouter([profile('a')],{failureThreshold:1,maxRetries:0,fetch:async()=>({ok:false,status:500})});await assert.rejects(r.complete({capability:'planning',contextTokens:1,messages:[]}));assert.equal(r.snapshot().a.circuitOpen,true);await assert.rejects(r.complete({capability:'planning',contextTokens:1,messages:[]}),/No healthy/);});
test('cli profile kind selects the CLI completion path (template rejected without running)', async () => {
  const r = new ModelRouter([{ ...profile('cli', 0.9), kind: 'cli', model: 'opencode/test' }], { maxRetries: 0 });
  await assert.rejects(r.complete({ capability: 'planning', contextTokens: 1, messages: [] }), /CLI model produced no output|CLI model returned no text|opencode run exited|ENOENT|timed out/);
});
const sseResponse = (chunks, usage = null) => ({
  ok: true,
  headers: { get: (k) => (k === 'content-type' ? 'text/event-stream' : null) },
  body: {
    getReader() {
      const queue = chunks.slice();
      return {
        read: async () => (queue.length ? { done: false, value: new TextEncoder().encode(queue.shift()) } : { done: true, value: undefined }),
        cancel: async () => {},
      };
    },
  },
});
test('completeStream parses SSE deltas and yields them through onDelta', async () => {
  const deltas = [];
  const r = new ModelRouter([profile('a', 0.6), profile('b', 0.5)], {
    fetch: async () => sseResponse([`data: ${JSON.stringify({ choices: [{ delta: { content: 'hel' } }] })}\n`, `data: ${JSON.stringify({ choices: [{ delta: { content: 'lo' } }] })}\n`, `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 9, completion_tokens: 3 } })}\n`, 'data: [DONE]\n']),
  });
  const out = await r.completeStream({ capability: 'planning', contextTokens: 1, messages: [] }, (d) => deltas.push(d));
  assert.equal(out.content, 'hello');
  assert.deepEqual(deltas, ['hel', 'lo']);
  assert.equal(out.usage.inputTokens, 9);
});
test('completeStream falls back to complete() when the stream endpoint fails', async () => {
  let n = 0;
  const r = new ModelRouter([profile('a', 0.6)], { maxRetries: 1, fetch: async () => { n++; return n === 1 ? { ok: false, status: 503 } : ok('done'); } });
  const deltas = [];
  const out = await r.completeStream({ capability: 'planning', contextTokens: 1, messages: [] }, (d) => deltas.push(d));
  assert.equal(out.content, 'done');
  assert.equal(deltas.length, 0);
  assert.equal(n, 2);
});
test('completeStream consumes a non-SSE response as one-shot content', async () => {
  const r = new ModelRouter([profile('a', 0.6)], { fetch: async () => ok('whole thing') });
  const deltas = [];
  const out = await r.completeStream({ capability: 'planning', contextTokens: 1, messages: [] }, (d) => deltas.push(d));
  assert.equal(out.content, 'whole thing');
  assert.equal(deltas.length, 0);
});
test('completeStream races profiles: first delta wins, loser output ignored', async () => {
  let calls = 0;
  const slow = { ok: true, headers: { get: (k) => (k === 'content-type' ? 'text/event-stream' : null) }, body: { getReader: () => ({ read: () => new Promise((res) => setTimeout(() => res({ done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'SLOW' } }] })}\n`) }), 120)), cancel: async () => {} }) } };
  const fast = sseResponse([`data: ${JSON.stringify({ choices: [{ delta: { content: 'fast!' } }] })}\n`, 'data: [DONE]\n']);
  const r = new ModelRouter([profile('a', 0.9), profile('b', 0.5)], { raceCount: 2, fetch: async () => (calls++ === 0 ? slow : fast) });
  const deltas = [];
  const out = await r.completeStream({ capability: 'planning', contextTokens: 1, messages: [] }, (d) => deltas.push(d));
  assert.equal(out.content, 'fast!');
  assert.equal(out.profileId, 'b');
  assert.deepEqual(deltas, ['fast!']);
});
