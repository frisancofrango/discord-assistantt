import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { createDiscordRuntime } from './discord/gateway-runtime.js';
import { readdirSync } from 'node:fs';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = createLogger({ level: config.logLevel, base: { environment: config.env } });
let runtime;
let client;
let discordRuntime;
let stopping = false;

async function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'graceful shutdown started');
  const timer = setTimeout(() => { logger.fatal('shutdown deadline exceeded'); process.exit(1); }, config.shutdownTimeoutMs);
  timer.unref();
  try {
    await discordRuntime?.close();
    await runtime?.native?.close();
    client?.removeAllListeners();
    client?.destroy();
    await runtime?.close();
  } catch (err) { logger.error({ err }, 'shutdown error'); exitCode = 1; }
  finally { clearTimeout(timer); process.exitCode = exitCode; }
}

try {
  if (!config.token) throw new Error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  runtime = await startFoundation(config, logger);
  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessageReactions, GatewayIntentBits.GuildWebhooks, GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildScheduledEvents, GatewayIntentBits.GuildEmojisAndStickers],
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
  discordRuntime = createDiscordRuntime({ client, runtime, config, logger });
  client.discordRuntime = discordRuntime;
  const autonomyStore = new PostgresAutonomyStore(runtime.db);
  const snapshotReader = async (guildId) => (await discordRuntime.tools.invoke('guild.snapshot', { guildId }, { client, db:runtime.db, idempotencyKey:`workflow:snapshot:${guildId}:${Date.now()}`, autonomy:'advisor', actor:{authenticated:true,guildMember:true,isOwner:true,permissions:[]} })).output.snapshot;
  const permissionResolver = async (guildId) => { const guild=await client.guilds.fetch(guildId); return guild.members.me?.permissions?.toArray?.() ?? []; };
  const executor = new SafeWorkflowExecutor({ store:autonomyStore, tools:discordRuntime.tools, snapshotReader, permissionResolver, maxSnapshotAgeMs:config.autonomy.snapshotMaxAgeMs, concurrency:config.autonomy.concurrency });
  const rollback = new RollbackService({ store:autonomyStore, tools:discordRuntime.tools, snapshotReader, maxSnapshotAgeMs:config.autonomy.snapshotMaxAgeMs });
  runtime.autonomy = { config:config.autonomy, store:autonomyStore, hydrate:hydrateProposal, approvals:new ApprovalService({store:autonomyStore,pepper:config.autonomy.approvalTokenPepper,ttlMs:config.autonomy.approvalTtlMs}), executor, rollback };
  runtime.native = createNativeRuntime({ db:runtime.db, queue:runtime.queue, tools:discordRuntime.tools, config, logger, client });
  if (runtime.state.database && runtime.state.redis) await runtime.native.start();
  await client.login(config.token);
  if (runtime.state.database) executor.recover(async(id)=>hydrateProposal(await autonomyStore.getProposal(id)),async(row)=>({id:row.metadata?.actorId,guildId:row.guild_discord_id,authenticated:true,isOwner:true,permissions:await permissionResolver(row.guild_discord_id)})).catch((err)=>logger.error({err},'safe workflow recovery failed'));
} catch (err) {
  logger.fatal({ err }, 'Azure startup failed');
  await shutdown('startup-failure', 1);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
process.on('uncaughtException', (err) => { logger.fatal({ err }, 'uncaught exception'); shutdown('uncaughtException', 1); });
