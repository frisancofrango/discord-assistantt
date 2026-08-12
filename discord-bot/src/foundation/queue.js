import IORedis from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';

export function createQueueRuntime(config, logger) {
  const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: true, connectTimeout: 3000, retryStrategy: (times) => times <= 2 ? Math.min(times * 200, 500) : null });
  const queues = new Map(); const workers = new Set(); const events = new Set();
  const options = { connection, prefix: config.redis.prefix };
  function queue(name) { if (!queues.has(name)) queues.set(name, new Queue(name, options)); return queues.get(name); }
  async function enqueue(name, type, data, opts = {}) {
    if (!opts.idempotencyKey) throw new TypeError('idempotencyKey is required');
    return queue(name).add(type, data, { jobId: opts.idempotencyKey, attempts: opts.attempts ?? 5, backoff: opts.backoff ?? { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800 }, ...opts.jobOptions });
  }
  function work(name, processor, opts = {}) {
    const worker = new Worker(name, async (job, token) => {
      const controls = { progress: (value) => job.updateProgress(value), isCancelled: async () => (await job.getState()) === 'failed' || job.data?.cancelled === true, token };
      return processor(job.data, controls, job);
    }, { ...options, concurrency: opts.concurrency ?? config.queue.concurrency });
    worker.on('error', (err) => logger.error({ err, queue: name }, 'queue worker error')); workers.add(worker); return worker;
  }
  function observe(name) { const event = new QueueEvents(name, options); events.add(event); return event; }
  async function cancel(name, jobId, reason = 'cancelled') { const job = await queue(name).getJob(jobId); if (!job) return false; const state = await job.getState(); if (state === 'waiting' || state === 'delayed') await job.remove(); else await job.updateData({ ...job.data, cancelled: true, cancellationReason: reason }); return true; }
  async function check() { if (connection.status === 'wait') await connection.connect(); return (await connection.ping()) === 'PONG'; }
  async function close() { await Promise.allSettled([...workers].map((w) => w.close())); await Promise.allSettled([...events].map((e) => e.close())); await Promise.allSettled([...queues.values()].map((q) => q.close())); await connection.quit().catch(() => connection.disconnect()); }
  return { enqueue, work, observe, cancel, check, close, connection };
}
