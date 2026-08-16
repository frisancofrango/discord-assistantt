import { SlashCommandBuilder } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Realiza o desafio de verificação anti-bot para liberar acesso ao servidor.'),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de verificação indisponível.', ephemeral: true });

    const session = await native.verification.startSession(interaction.guildId, interaction.user.id);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'VERIFICAÇÃO DE SEGURANÇA',
          body: 'Leia as regras do servidor e clique no botão abaixo para iniciar o teste anti-bot:',
          buttons: [button.primary(`verify:rules:${session.id}`, '✅ Iniciar Verificação')],
        }),
      ],
    });
  },
};
