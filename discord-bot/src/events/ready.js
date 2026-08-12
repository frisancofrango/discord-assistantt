import { Events, ActivityType } from 'discord.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    client.logger.info({ discordUserId: client.user.id }, 'Azure connected to Discord');
    client.user.setPresence({
      activities: [{ name: 'the storefront', type: ActivityType.Watching }],
      status: 'online',
    });
  },
};
