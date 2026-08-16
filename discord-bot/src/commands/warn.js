import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Aplica uma advertência formal a um membro com aviso na DM.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('usuario').setDescription('Membro advertido').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo da advertência').setRequired(true)),

  async execute(interaction, client) {
    const user = interaction.options.getUser('usuario');
    const reason = interaction.options.getString('motivo');

    await client.runtime.db.query(
      `INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason) VALUES ($1, $2, $3, 'warn', $4)`,
      [interaction.guildId, user.id, interaction.user.id, reason]
    );

    await user.send({
      flags: V2,
      components: [panel({ title: 'ADVERTÊNCIA RECEBIDA', body: `Você recebeu uma advertência no servidor **${interaction.guild.name}**.\n> **Motivo:** ${reason}` })],
    }).catch(() => {});

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'ADVERTÊNCIA REGISTRADA', body: `Advertência aplicada a <@${user.id}> com sucesso.\nMotivo: ${reason}` })],
    });
  },
};
