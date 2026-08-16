import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Aplica um castigo temporário (timeout) a um membro.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('usuario').setDescription('Membro a ser silenciado').setRequired(true))
    .addIntegerOption(o => o.setName('minutos').setDescription('Duração do castigo em minutos (ex: 10)').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo do castigo').setRequired(false)),

  async execute(interaction) {
    const user = interaction.options.getUser('usuario');
    const mins = interaction.options.getInteger('minutos');
    const reason = interaction.options.getString('motivo') || 'Infração de regras.';

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: 'Membro não encontrado.', ephemeral: true });

    await member.timeout(mins * 60 * 1000, reason);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'CASTIGO APLICADO', body: `O membro <@${user.id}> foi silenciado por **${mins} minutos**.\nMotivo: ${reason}` })],
    });
  },
};
