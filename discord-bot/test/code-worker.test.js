import test from 'node:test';import assert from 'node:assert/strict';import {assertSandboxPolicy} from '../src/agent/code-worker.js';
test('code sandbox denies deployment and production mutation commands',()=>{for(const command of ['npm publish','git push origin main','kubectl apply -f x','docker compose up'])assert.throws(()=>assertSandboxPolicy(command),/owner approval/);});
test('code sandbox permits validation commands',()=>assert.doesNotThrow(()=>assertSandboxPolicy('npm test')));
