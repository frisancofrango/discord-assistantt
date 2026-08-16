import { Events, ActivityType } from 'discord.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    client.logger.info({ discordUserId: client.user.id }, 'Loop connected to Discord');

    let step = 0;
    const updatePresence = () => {
      try {
        const totalMembers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
        const guildCount = client.guilds.cache.size;

        const activities = [
          {
            name: 'Loop © · O Futuro do E-Commerce 💚',
            type: ActivityType.Streaming,
            url: 'https://twitch.tv/loop',
          },
          {
            name: '🛍️ /sales · Vitrine & PIX Automático',
            type: ActivityType.Watching,
          },
          {
            name: `💚 ${totalMembers.toLocaleString()} clientes em ${guildCount} servidores`,
            type: ActivityType.Listening,
          },
          {
            name: '📟 /wallet · Carteira Digital & Cashback VIP',
            type: ActivityType.Playing,
          },
          {
            name: '🛡️ Loop OS · Ambiente Seguro & Anti-Nuke',
            type: ActivityType.Competing,
          },
        ];

        const currentActivity = activities[step % activities.length];
        step++;

        client.user.setPresence({
          activities: [currentActivity],
          status: 'online',
        });
      } catch (err) {
        client.logger.warn({ err: err.message }, 'Failed to update rich presence');
      }
    };

    // Set initial presence immediately
    updatePresence();

    // Rotate status every 30 seconds
    setInterval(updatePresence, 30_000);
  },
};

