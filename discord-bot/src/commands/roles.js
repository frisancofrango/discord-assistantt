import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Cria painéis de auto-atribuição de cargos para membros.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sc =>
      sc.setName('painel')
        .setDescription('Cria um painel interativo de autorole.')
        .addRoleOption(o => o.setName('cargo').setDescription('Cargo a ser atribuído').setRequired(true))
        .addStringOption(o => o.setName('label').setDescription('Texto do botão (ex: Notificações)').setRequired(true))
    ),

  async execute(interaction) {
    const role = interaction.options.getRole('cargo');
    const label = interaction.options.getString('label');

    return interaction.reply({
      flags: V2,
      components: [
        panel({
          title: 'AUTO-ATRIBUIÇÃO DE CARGOS',
          body: `Clique no botão abaixo para receber ou remover o cargo <@&${role.id}>:`,
          buttons: [button.primary(`role:toggle:${role.id}`, label)],
        }),
      ],
    });
  },
};
