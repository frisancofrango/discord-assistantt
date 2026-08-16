import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('task')
    .setDescription('Solicita ao Loop a execução autônoma de uma tarefa complexa no servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('objetivo').setDescription('Qual objetivo o Loop deve planejar e executar?').setRequired(true).setMaxLength(1000)),

  async execute(interaction, client) {
    const goal = interaction.options.getString('objetivo');
    await interaction.deferReply({ ephemeral: true });

    const actor = {
      id: interaction.user.id,
      guildId: interaction.guildId,
      authenticated: true,
      isOwner: interaction.guild?.ownerId === interaction.user.id,
      permissions: interaction.memberPermissions?.toArray() ?? [],
    };

    try {
      const proposal = await client.runtime.autonomy.propose({
        guildId: interaction.guildId,
        actor,
        goal,
        rawInput: `/task objetivo:${goal}`,
      });

      const { proposalPanel } = await import('../autonomy/ui.js');
      return interaction.editReply({ ...proposalPanel(proposal), ephemeral: true });
    } catch (err) {
      return interaction.editReply({
        flags: V2,
        components: [panel({ title: 'FALHA NO PLANEJAMENTO', body: err.message })],
      });
    }
  },
};
