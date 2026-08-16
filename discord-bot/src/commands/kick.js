import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';
import { createConfirmation } from '../foundation/policy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um membro do servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('usuario').setDescription('Membro a ser expulso').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo da expulsão').setRequired(false)),

  async execute(interaction) {
    const user = interaction.options.getUser('usuario');
    const reason = interaction.options.getString('motivo') || 'Nenhum motivo informado.';
    const token = createConfirmation({ type: 'kick', userId: user.id, tag: user.tag, reason });

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'CONFIRMAÇÃO DE EXPULSÃO',
          body: `Deseja realmente expulsar o membro **<@${user.id}>**?\n> **Motivo:** ${reason}`,
          buttons: [
            button.danger(`modconfirm:${token}`, 'Confirmar Expulsão'),
            button.neutral('modcancel', 'Cancelar'),
          ],
        }),
      ],
    });
  },
};
