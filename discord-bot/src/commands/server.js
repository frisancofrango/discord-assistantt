import { SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Exibe informações completas sobre a infraestrutura e uptime do Loop.'),

  async execute(interaction, client) {
    const uptimeSec = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'INFRAESTRUTURA DO SISTEMA LOOP',
          body:
            `> **Versão:** **\`Loop OS v2.0.0\`**\n` +
            `> **Latência WebSocket:** **\`${client.ws.ping}ms\`**\n` +
            `> **Tempo de Atividade (Uptime):** **\`${hours}h ${mins}m\`**\n` +
            `> **Banco de Dados:** **\`PostgreSQL 16 + pgvector\`**\n` +
            `> **Filas em Memória:** **\`Redis 7.2 + BullMQ\`**`,
        }),
      ],
    });
  },
};
