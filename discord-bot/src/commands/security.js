import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Painel de defesa anti-nuke, quarentena e whitelist de moderadores.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('status').setDescription('Consulta o status do escudo de defesa do servidor.'))
    .addSubcommand(sc =>
      sc.setName('whitelist')
        .setDescription('Adiciona um moderador confiável à lista branca do Anti-Nuke.')
        .addUserOption(o => o.setName('usuario').setDescription('Membro a ser adicionado').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo da autorização').setRequired(false))
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de segurança indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'whitelist') {
      const user = interaction.options.getUser('usuario');
      const reason = interaction.options.getString('motivo') || 'Operador autorizado';

      await native.security.addWhitelist(interaction.guildId, user.id, reason, ctx);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [panel({ title: 'WHITELIST ATUALIZADA', body: `Membro <@${user.id}> adicionado à lista branca de segurança.` })],
      });
    }

    const settings = await native.settings.getSettings(interaction.guildId);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'ESCUDO DE DEFESA & SEGURANÇA',
          body:
            `> **Nível Anti-Raid:** **\`${(settings.antiRaidLevel || 'standard').toUpperCase()}\`**\n` +
            `> **Proteção Anti-Nuke:** **\`ATIVO\`**\n` +
            `> **Monitoramento de Incidentes:** 24/7 em tempo real`,
          buttons: [button.neutral('panel:security:quarantine_view', '🚨 Auditoria de Incidentes')],
        }),
      ],
    });
  },
};
