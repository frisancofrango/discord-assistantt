import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load every registered slash command's JSON definition. */
export async function loadCommandDefinitions() {
  const commands = [];
  const commandsPath = join(__dirname, 'commands');
  for (const file of readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(join(commandsPath, file)).href);
    if (mod.default?.data) commands.push(mod.default.data.toJSON());
  }
  return commands;
}

/**
 * Register slash commands with Discord.
 * Guild-scoped when `guildId` is set (instant), global otherwise.
 */
export async function deployCommands({ token, clientId, guildId = null, logger = console }) {
  if (!token || !clientId) throw new Error('Missing DISCORD_TOKEN or CLIENT_ID');
  const commands = await loadCommandDefinitions();
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
  await rest.put(route, { body: commands });
  return { count: commands.length, target: guildId ? `guild ${guildId}` : 'global' };
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  try {
    const result = await deployCommands({ token: config.token, clientId: config.clientId, guildId: config.guildId });
    console.log(`Deployed ${result.count} command(s) to ${result.target}.`);
  } catch (err) {
    console.error('Deployment failed:', err.message ?? err);
    process.exit(1);
  }
}