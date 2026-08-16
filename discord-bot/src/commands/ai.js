import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Central de inteligência artificial autônoma e AI Studio.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc => sc.setName('persona').setDescription('Alterna a persona ativa da IA no servidor.'))
    .addSubcommand(sc => sc.setName('sandbox').setDescription('Abre o simulador de testes de prompts e raciocínio neural.')),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'AI Studio indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const settings = await native.settings.getSettings(interaction.guildId);

    if (sub === 'persona') {
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          panel({
            title: 'LOOP AI STUDIO · PERSONAS',
            body:
              `> **Persona Ativa:** **\`${(settings.aiPersona || 'concierge').toUpperCase()}\`**
` +
              `> **Modo de Autonomia:** **\`${(settings.aiAutonomy || 'operator').toUpperCase()}\`**

` +
              `Selecione uma ação abaixo para ajustar os parâmetros da inteligência artificial:`,
            buttons: [
              button.primary('panel:ai:sandbox_modal', '🧪 Abrir Sandbox'),
              button.neutral('panel:tab:ai', '⚙️ Painel Completo de IA'),
            ],
          }),
        ],
      });
    }

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'SIMULADOR DE IA · SANDBOX',
          body: 'Clique abaixo para disparar um prompt de teste para a persona neural ativa:',
          buttons: [button.primary('panel:ai:sandbox_modal', '🧪 Executar Teste')],
        }),
      ],
    });
  },
};
