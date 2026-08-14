import 'dotenv/config';
import { z } from 'zod';

const parseBool = (defaultValue) => z.enum(['true', 'false']).default(defaultValue).transform((v) => v === 'true');
const optionalBool = z.enum(['true', 'false']).transform((v) => v === 'true').optional();
/** Optional ID env vars: empty strings are treated as unset. */
const optionalId = z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional());
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DISCORD_TOKEN: z.string().min(1).optional(),
  CLIENT_ID: optionalId,
  GUILD_ID: optionalId,
  MOD_LOG_CHANNEL_ID: optionalId,
  DEPLOY_COMMANDS_ON_START: parseBool('false'),
  DATABASE_URL: z.string().url().default('postgresql://azure:azure@localhost:5432/azure'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_SSL: parseBool('false'),
  RUN_MIGRATIONS: parseBool('true'),
  REQUIRE_DEPENDENCIES: optionalBool,
  QUEUE_PREFIX: z.string().regex(/^[A-Za-z0-9:_-]+$/).default('azure'),
  QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
  MODEL_PROFILES_JSON: z.string().default('[]'),
  MODEL_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  MODEL_PACING_MS: z.coerce.number().int().min(0).max(120000).default(35000),
  MODEL_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(20).default(3),
  MODEL_CIRCUIT_RESET_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  AGENT_BUDGET_USD: z.coerce.number().min(0).default(5),
  RESEARCH_MAX_BYTES: z.coerce.number().int().min(1024).max(1073741824).default(10485760),
  RESEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(20000),
  RESEARCH_ALLOWED_TYPES: z.string().default('text/html,text/plain,application/json,application/pdf'),
  RESEARCH_ALLOWED_HOSTS: z.string().default(''),
  CODE_WORKSPACE_ROOT: z.string().default('.'),
  CODE_VALIDATION_COMMANDS_JSON: z.string().default('["npm test","npm run check"]'),
  CODE_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(1800000).default(120000),
  EMBED_BASE_URL: z.string().url().default('https://api.nomic.ai/v1'),
  EMBED_API_KEY: z.string().optional(),
  EMBED_MODEL: z.string().default('nomic-embed-text-v1.5'),
  EMBED_DIMENSIONS: z.coerce.number().int().min(64).max(4096).default(768),
  MEMORY_SEARCH_LIMIT: z.coerce.number().int().min(1).max(50).default(8),
  MEMORY_INGESTION: parseBool('true'),
  DISCORD_CONTEXT_TOKENS: z.coerce.number().int().min(1000).max(100000).default(6000),
  DISCORD_CONTEXT_MESSAGES: z.coerce.number().int().min(5).max(200).default(30),
  RACE_PROFILES: z.coerce.number().int().min(1).max(8).default(2),
  ENGAGEMENT_COOLDOWN_MS: z.coerce.number().int().min(1000).max(3600000).default(45000),
  ENGAGEMENT_PASSIVE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  AUTONOMY_TIER_COUNT: z.coerce.number().int().min(2).max(3).default(3),
  APPROVAL_TTL_MS: z.coerce.number().int().min(1000).max(86400000).default(900000),
  APPROVAL_TOKEN_PEPPER: z.string().default(''),
  SNAPSHOT_MAX_AGE_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  WORKFLOW_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  TICKET_OPEN_LIMIT: z.coerce.number().int().min(1).max(20).default(3),
  TICKET_DUPLICATE_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  TICKET_SLA_MINUTES: z.coerce.number().int().min(1).max(10080).default(60),
  VERIFICATION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  VERIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  VERIFIED_ROLE_ID: optionalId,
  QUARANTINE_ROLE_ID: optionalId,
  INVENTORY_RESERVATION_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  ACCEPTABLE_USE_VERSION: z.string().default('1'),
  MARKETING_MAX_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(30),
  ANALYTICS_RETENTION_DAYS: z.coerce.number().int().min(7).max(730).default(180),
});

export class ConfigurationError extends Error {
  constructor(issues) {
    super(`Invalid configuration: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    this.name = 'ConfigurationError';
    this.issues = issues;
  }
}

export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) throw new ConfigurationError(result.error.issues);
  const raw = result.data;
  const production = raw.NODE_ENV === 'production';
  if (production && !raw.DISCORD_TOKEN) throw new ConfigurationError([{ path: ['DISCORD_TOKEN'], message: 'required in production' }]);
  let modelProfiles; let validationCommands;
  try { modelProfiles = JSON.parse(raw.MODEL_PROFILES_JSON); validationCommands = JSON.parse(raw.CODE_VALIDATION_COMMANDS_JSON); }
  catch { throw new ConfigurationError([{ path: ['MODEL_PROFILES_JSON'], message: 'model profiles and validation commands must be valid JSON' }]); }
  if (!Array.isArray(modelProfiles) || !Array.isArray(validationCommands)) throw new ConfigurationError([{ path: ['MODEL_PROFILES_JSON'], message: 'expected JSON arrays' }]);
  return Object.freeze({
    env: raw.NODE_ENV, logLevel: raw.LOG_LEVEL,
    discord: Object.freeze({ token: raw.DISCORD_TOKEN ?? null, clientId: raw.CLIENT_ID ?? null, guildId: raw.GUILD_ID ?? null, modLogChannelId: raw.MOD_LOG_CHANNEL_ID ?? null, deployCommandsOnStart: raw.DEPLOY_COMMANDS_ON_START, contextTokens: raw.DISCORD_CONTEXT_TOKENS, contextMessages: raw.DISCORD_CONTEXT_MESSAGES, engagementCooldownMs: raw.ENGAGEMENT_COOLDOWN_MS, passiveThreshold: raw.ENGAGEMENT_PASSIVE_THRESHOLD }),
    database: Object.freeze({ url: raw.DATABASE_URL, ssl: raw.DATABASE_SSL, runMigrations: raw.RUN_MIGRATIONS }),
    redis: Object.freeze({ url: raw.REDIS_URL, prefix: raw.QUEUE_PREFIX }),
    http: Object.freeze({ host: raw.HTTP_HOST, port: raw.HTTP_PORT }),
    queue: Object.freeze({ concurrency: raw.QUEUE_CONCURRENCY }),
    models: Object.freeze({ profiles: modelProfiles, maxRetries: raw.MODEL_MAX_RETRIES, failureThreshold: raw.MODEL_FAILURE_THRESHOLD, circuitResetMs: raw.MODEL_CIRCUIT_RESET_MS, pacingMs: raw.MODEL_PACING_MS, budgetUsd: raw.AGENT_BUDGET_USD, raceCount: raw.RACE_PROFILES }),
    research: Object.freeze({ maxBytes: raw.RESEARCH_MAX_BYTES, timeoutMs: raw.RESEARCH_TIMEOUT_MS, allowedTypes: raw.RESEARCH_ALLOWED_TYPES.split(',').map((v) => v.trim()), allowedHosts: raw.RESEARCH_ALLOWED_HOSTS.split(',').map((v) => v.trim()).filter(Boolean) }),
    code: Object.freeze({ workspaceRoot: raw.CODE_WORKSPACE_ROOT, validationCommands, commandTimeoutMs: raw.CODE_COMMAND_TIMEOUT_MS }),
    embeddings: Object.freeze({ baseUrl: raw.EMBED_BASE_URL, apiKey: raw.EMBED_API_KEY ?? null, model: raw.EMBED_MODEL, dimensions: raw.EMBED_DIMENSIONS, enabled: Boolean(raw.EMBED_BASE_URL) }),
    memory: Object.freeze({ searchLimit: raw.MEMORY_SEARCH_LIMIT, ingestion: raw.MEMORY_INGESTION === undefined ? Boolean(raw.EMBED_BASE_URL) : raw.MEMORY_INGESTION !== 'false' }),
    autonomy: Object.freeze({ tierCount: raw.AUTONOMY_TIER_COUNT, approvalTtlMs: raw.APPROVAL_TTL_MS, approvalTokenPepper: raw.APPROVAL_TOKEN_PEPPER, snapshotMaxAgeMs: raw.SNAPSHOT_MAX_AGE_MS, concurrency: raw.WORKFLOW_CONCURRENCY }),
    native: Object.freeze({
      tickets: Object.freeze({ openLimit: raw.TICKET_OPEN_LIMIT, duplicateMinutes: raw.TICKET_DUPLICATE_MINUTES, slaMinutes: raw.TICKET_SLA_MINUTES }),
      verification: Object.freeze({ ttlMinutes: raw.VERIFICATION_TTL_MINUTES, maxAttempts: raw.VERIFICATION_MAX_ATTEMPTS, verifiedRoleId: raw.VERIFIED_ROLE_ID ?? null, quarantineRoleId: raw.QUARANTINE_ROLE_ID ?? null }),
      commerce: Object.freeze({ reservationMinutes: raw.INVENTORY_RESERVATION_MINUTES, acceptableUseVersion: raw.ACCEPTABLE_USE_VERSION }),
      moderation: Object.freeze({}), marketing: Object.freeze({ maxRatePerMinute: raw.MARKETING_MAX_RATE_PER_MINUTE }), analyticsRetentionDays: raw.ANALYTICS_RETENTION_DAYS,
    }),
    requireDependencies: raw.REQUIRE_DEPENDENCIES ?? production,
    shutdownTimeoutMs: raw.SHUTDOWN_TIMEOUT_MS,
  });
}

const secretKey = /token|secret|password|authorization|cookie|database.*url|redis.*url/i;
export function redactSecrets(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, seen));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, secretKey.test(k) ? '[REDACTED]' : redactSecrets(v, seen)]));
}
