import { createDatabase, migrate, checkDatabase } from './database.js';
import { createRepositories } from './repositories.js';
import { createQueueRuntime } from './queue.js';
import { createHealthServer } from './health.js';
import { createAgentRuntime } from '../agent/runtime.js';

export async function startFoundation(config, logger) {
  const state = { started: false, shuttingDown: false, database: false, redis: false };
  const db = createDatabase(config.database, logger);
  const queue = createQueueRuntime(config, logger);
  const repositories = createRepositories(db);
  const checks = { database: () => checkDatabase(db), redis: () => queue.check() };
  const health = createHealthServer({ config, checks, logger, state });
  await health.start();
  const failures = [];
  try { if (config.database.runMigrations) await migrate(db, logger); await checkDatabase(db); state.database = true; } catch (err) { failures.push(['database', err]); logger.error({ err }, 'database initialization failed'); }
  try { await queue.check(); state.redis = true; } catch (err) { failures.push(['redis', err]); logger.error({ err }, 'Redis initialization failed'); }
  if (config.requireDependencies && failures.length) {
    await health.close(); await queue.close(); await db.end();
    throw new AggregateError(failures.map(([, e]) => e), `Required dependencies unavailable: ${failures.map(([n]) => n).join(', ')}`);
  }
  state.started = failures.length === 0;
  if (failures.length) logger.warn({ unavailable: failures.map(([n]) => n) }, 'development runtime started degraded; readiness remains false');
  const agent = createAgentRuntime({ config, repositories, queue, logger });
  if (state.redis && state.database) agent.start();
  let closing;
  async function close() {
    if (closing) return closing;
    state.shuttingDown = true;
    closing = Promise.allSettled([health.close(), agent.close()]).then(() => Promise.allSettled([queue.close(), db.end()])).then((results) => { logger.info({ results: results.map((r) => r.status) }, 'foundation stopped'); });
    return closing;
  }
  return { state, db, repositories, queue, health, agent, close };
}
