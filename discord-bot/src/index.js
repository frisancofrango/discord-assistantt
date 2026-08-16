import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { createDiscordRuntime } from './discord/gateway-runtime.js';
import { readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { createLogger } from './foundation/logger.js';
import { startFoundation } from './foundation/runtime.js';
import { PostgresAutonomyStore, hydrateProposal } from './autonomy/store.js';
import { ApprovalService } from './autonomy/approval.js';
import { SafeWorkflowExecutor } from './autonomy/execution.js';
import { RollbackService } from './autonomy/rollback.js';
import { createNativeRuntime } from './native/runtime.js';
import { EmbeddingClient } from './memory/embeddings.js';
import { SemanticMemoryService } from './memory/store.js';
import { createWebhookServer } from './foundation/webhook-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = createLogger({ level: config.logLevel, base: { environment: config.env } });
let runtime;
let client;
let discordRuntime;
let webhookServer;
let stopping = false;

async function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'graceful shutdown started');
  const timer = setTimeout(() => {
    logger.fatal('shutdown deadline exceeded');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  timer.unref();
  try {
    await webhookServer?.close();
    await discordRuntime?.close();
    await runtime?.native?.close();
    client?.removeAllListeners();
    client?.destroy();
    await runtime?.close();
  } catch (err) {
    logger.error({ err }, 'shutdown error');
    exitCode = 1;
  } finally {
    clearTimeout(timer);
    process.exitCode = exitCode;
    setTimeout(() => process.exit(exitCode), 2000);
  }
}

try {
  if (!config.token) throw new Error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  runtime = await startFoundation(config, logger);
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessageReactions,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildScheduledEvents,
      GatewayIntentBits.GuildEmojisAndStickers,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
  });
  client.commands = new Collection();
  client.runtime = runtime;
  client.logger = logger;

  const commandsPath = join(__dirname, 'commands');
  for (const file of readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
    const command = (await import(pathToFileURL(join(commandsPath, file)).href)).default;
    if (command?.data && command?.execute) client.commands.set(command.data.name, command);
    else logger.warn({ file }, 'command skipped: missing data or execute');
  }
  const eventsPath = join(__dirname, 'events');
  for (const file of readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
    const event = (await import(pathToFileURL(join(eventsPath, file)).href)).default;
    if (!event?.name || !event?.execute) continue;
    const listener = (...args) => event.execute(...args, client);
    event.once ? client.once(event.name, listener) : client.on(event.name, listener);
  }

  runtime.memory = new SemanticMemoryService({
    db: runtime.db,
    embedder: new EmbeddingClient({
      baseUrl: config.embeddings.baseUrl,
      apiKey: config.embeddings.apiKey,
      model: config.embeddings.model,
      dimensions: config.embeddings.dimensions,
      logger,
    }),
    logger,
    searchLimit: config.memory.searchLimit,
  });

  discordRuntime = createDiscordRuntime({ client, runtime, config, logger, memory: runtime.memory });
  client.discordRuntime = discordRuntime;
  const autonomyStore = new PostgresAutonomyStore(runtime.db);
  const snapshotReader = async (guildId) =>
    (
      await discordRuntime.tools.invoke(
        'guild.snapshot',
        { guildId },
        {
          client,
          db: runtime.db,
          idempotencyKey: `workflow:snapshot:${guildId}:${Date.now()}`,
          autonomy: 'advisor',
          actor: { authenticated: true, guildMember: true, isOwner: true, permissions: [] },
        }
      )
    ).output.snapshot;
  const permissionResolver = async (guildId) => {
    const guild = await client.guilds.fetch(guildId);
    const me =
      guild.members.me ??
      (await guild.members
        .fetch({ user: client.user.id, force: true })
        .then((m) => m.get(client.user.id) ?? null)
        .catch(() => null));
    return me?.permissions?.toArray?.() ?? [];
  };
  const executor = new SafeWorkflowExecutor({
    store: autonomyStore,
    tools: discordRuntime.tools,
    snapshotReader,
    permissionResolver,
    maxSnapshotAgeMs: config.autonomy.snapshotMaxAgeMs,
    concurrency: config.autonomy.concurrency,
  });
  const rollback = new RollbackService({
    store: autonomyStore,
    tools: discordRuntime.tools,
    snapshotReader,
    maxSnapshotAgeMs: config.autonomy.snapshotMaxAgeMs,
  });
  runtime.autonomy = {
    config: config.autonomy,
    store: autonomyStore,
    hydrate: hydrateProposal,
    approvals: new ApprovalService({
      store: autonomyStore,
      pepper: config.autonomy.approvalTokenPepper,
      ttlMs: config.autonomy.approvalTtlMs,
    }),
    executor,
    rollback,
  };
  runtime.native = createNativeRuntime({
    db: runtime.db,
    queue: runtime.queue,
    tools: discordRuntime.tools,
    config,
    logger,
    client,
  });

  if (runtime.state.database && runtime.state.redis) await runtime.native.start();

  // Initialize HTTP webhook ingress server
  webhookServer = createWebhookServer({
    commerce: runtime.native.commerce,
    logger,
  });
  webhookServer.listen().catch((err) => logger.warn({ err: err.message }, 'webhook server listen failed'));

  await client.login(config.token);

  setInterval(() => {
    const router = runtime?.agent?.router;
    if (!router || Date.now() - (router.lastAttemptAt || 0) < 60_000) return;
    router
      .complete({
        capability: 'conversation',
        contextTokens: 300,
        timeoutMs: 18_000,
        race: false,
        messages: [
          { role: 'system', content: 'You are Azure, a Discord server assistant. Reply with exactly: ok' },
          { role: 'user', content: 'keepalive' },
        ],
      })
      .then(() => logger.info({ health: router.snapshot() }, 'model keepalive ok'))
      .catch((err) => logger.warn({ err: err.message }, 'model keepalive failed'));
  }, 180_000);

  const FLYCTL = '/root/.fly/bin/flyctl';
  const refreshFarmEndpoints = async () => {
    const router = runtime?.agent?.router;
    if (!router || !process.env.FLY_APP_NAME) return;
    const out = await new Promise((resolve, reject) =>
      execFile(FLYCTL, ['machine', 'list', '--app', process.env.FLY_APP_NAME, '--json'], { timeout: 20000 }, (err, stdout) =>
        err ? reject(err) : resolve(stdout)
      )
    );
    const machines = JSON.parse(out);
    for (const m of machines) {
      const region = /^sess-(.+)$/.exec(m.name)?.[1];
      if (!region) continue;
      const profile = router.profiles.find((p) => p.id === `farm-${region}`);
      if (!profile || !m.private_ip) continue;
      const endpoint = `http://[${m.private_ip}]:80/v1`;
      if (profile.endpoint !== endpoint) {
        profile.endpoint = endpoint;
        logger.info({ profile: profile.id, endpoint }, 'farm endpoint refreshed');
      }
    }
  };
  setInterval(() => refreshFarmEndpoints().catch((err) => logger.debug({ err: err.message }, 'farm refresh failed')), 120_000);
  setTimeout(() => refreshFarmEndpoints().catch(() => {}), 5000);

  if (config.discord.deployCommandsOnStart && config.clientId) {
    (async () => {
      try {
        const { deployCommands } = await import('./deploy-commands.js');
        const result = await deployCommands({
          token: config.token,
          clientId: config.clientId,
          guildId: config.discord.guildId,
          logger,
        });
        logger.info({ count: result.count, target: result.target }, 'slash commands deployed on start');
      } catch (err) {
        logger.error({ err }, 'slash command deployment on start failed');
      }
    })();
  }
  if (runtime.state.database) {
    executor
      .recover(
        async (id) => hydrateProposal(await autonomyStore.getProposal(id)),
        async (row) => ({
          id: row.metadata?.actorId,
          guildId: row.guild_discord_id,
          authenticated: true,
          isOwner: true,
          permissions: await permissionResolver(row.guild_discord_id),
        })
      )
      .catch((err) => logger.error({ err }, 'safe workflow recovery failed'));
  }
} catch (err) {
  logger.fatal({ err }, 'Azure startup failed');
  await shutdown('startup-failure', 1);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  shutdown('uncaughtException', 1);
});
