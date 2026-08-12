import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationDir = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');
export function createDatabase(config, logger) {
  const pool = new pg.Pool({ connectionString: config.url, ssl: config.ssl ? { rejectUnauthorized: true } : false, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  pool.on('error', (err) => logger.error({ err }, 'idle PostgreSQL client error'));
  return pool;
}
export async function migrate(pool, logger) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(migrationDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
      if (!exists.rowCount) {
        await client.query(await readFile(join(migrationDir, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
        logger.info({ migration: name }, 'migration applied');
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  }
}
export async function checkDatabase(pool) { await pool.query('SELECT 1'); return true; }
