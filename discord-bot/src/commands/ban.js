import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';
import { createConfirmation } from '../foundation/policy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um membro do servidor com auditoria de segurança.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('usuario').setDescription('Membro a ser banido').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo do banimento').setRequired(false)),

  async execute(interaction) {
    const user = interaction.options.getUser('usuario');
    const reason = interaction.options.getString('motivo') || 'Nenhum motivo informado.';
    const token = createConfirmation({ type: 'ban', userId: user.id, tag: user.tag, reason });

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'CONFIRMAÇÃO DE BANIMENTO',
          body: `Deseja realmente banir o membro **<@${user.id}>** (\`${user.id}\`)?\n> **Motivo:** ${reason}`,
          buttons: [
            button.danger(`modconfirm:${token}`, 'Confirmar Banimento'),
            button.neutral('modcancel', 'Cancelar'),
          ],
        }),
      ],
    });
  },
};
