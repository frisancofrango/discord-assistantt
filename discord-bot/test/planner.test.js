import test from 'node:test';import assert from 'node:assert/strict';import { PlanSchema, finalizePlan } from '../src/agent/planner.js';
const step=(id,deps=[])=>({id,kind:'research',title:id,domain:'research',risk:'read',dependsOn:deps,input:{},preconditions:[],postconditions:[{description:'evidence exists',check:'evidence.count > 0'}],verification:{method:'persisted evidence',evidenceRequired:true},compensation:null});
const now=()=>new Date().toISOString();
test('plan schema accepts a valid DAG',()=>assert.equal(PlanSchema.parse({goal:'g',contextObservedAt:now(),domain:'research',risk:'read',steps:[step('a'),step('b',['a'])]}).steps.length,2));
test('plan schema tolerates malformed fields with defaults',()=>{
  const plan=PlanSchema.parse({goal:'g',contextObservedAt:now(),domain:'nonsense-domain',risk:'ultra',steps:[step('a'),{id:42,title:'',domain:null,risk:null,dependsOn:'x',input:null,compensation:'revert it'}]});
  assert.equal(plan.domain,'server_design');
  assert.equal(plan.risk,'low');
  const s=plan.steps[1];
  assert.equal(s.kind,'tool');assert.equal(s.title,'untitled step');assert.deepEqual(s.input,{});assert.deepEqual(s.postconditions,[]);assert.equal(s.compensation.action,'revert it');assert.equal(s.verification.method,'tool evidence');
});
test('finalizePlan prunes missing/cyclic deps and normalizes ids',()=>{
  const missing=finalizePlan(PlanSchema.parse({goal:'g',contextObservedAt:now(),domain:'research',risk:'read',steps:[step('a',['ghost']),step(42,['a'])]}),now());
  assert.deepEqual(missing.steps[0].dependsOn,[]);
  assert.equal(missing.steps[0].id,'a');
  assert.equal(missing.steps[1].id,'s1');
  const cyclic=finalizePlan(PlanSchema.parse({goal:'g',contextObservedAt:now(),domain:'research',risk:'read',steps:[step('a',['b']),step('b',['a'])]}),now());
  assert.deepEqual(cyclic.steps[0].dependsOn,[]);
  assert.deepEqual(cyclic.steps[1].dependsOn,['a']);
});
