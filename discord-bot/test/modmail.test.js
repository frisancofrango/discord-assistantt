import test from 'node:test';
import assert from 'node:assert/strict';
import { ModmailService } from '../src/native/modmail.js';

function createMockModmailDb() {
  const threads = [];
  return {
    threads,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes('insert into modmail_threads')) {
        const row = { id: `mdm_${threads.length + 1}`, guild_id: params[0], member_id: params[1], thread_id: params[2], status: 'open' };
        threads.push(row);
        return { rows: [row] };
      }
      if (lower.includes('select * from modmail_threads where thread_id = $1')) {
        const row = threads.find((t) => t.thread_id === params[0] && t.status === 'open');
        return { rows: row ? [row] : [] };
      }
      if (lower.includes('update modmail_threads set status = \'closed\'')) {
        const row = threads.find((t) => t.thread_id === params[0]);
        if (row) row.status = 'closed';
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    },
  };
}

test('ModmailService: createThread, getThreadByThreadId, and closeThread', async () => {
  const db = createMockModmailDb();
  const svc = new ModmailService({ db });

  await svc.createThread('g1', 'usr_1', 'thr_123');
  const open = await svc.getThreadByThreadId('thr_123');
  assert.equal(open.member_id, 'usr_1');
  assert.equal(open.status, 'open');

  const closed = await svc.closeThread('thr_123');
  assert.equal(closed.status, 'closed');

  const after = await svc.getThreadByThreadId('thr_123');
  assert.equal(after, undefined);
});
