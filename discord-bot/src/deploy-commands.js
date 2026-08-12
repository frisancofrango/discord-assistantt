import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!config.token || !config.clientId) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

const commands = [];
const commandsPath = join(__dirname, 'commands');
for (const file of readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(join(commandsPath, file)).href);
  if (mod.default?.data) commands.push(mod.default.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

try {
  console.log(`Deploying ${commands.length} command(s)...`);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: commands });
  console.log(
    config.guildId
      ? `Deployed to guild ${config.guildId} (instant).`
      : 'Deployed globally (may take up to 1 hour to appear).',
  );
} catch (err) {
  console.error('Deployment failed:', err);
  process.exit(1);
}
