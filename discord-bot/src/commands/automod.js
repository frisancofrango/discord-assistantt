import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configura regras de proteção contra spam, links não autorizados e convites.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sc =>
      sc.setName('regra')
        .setDescription('Ativa ou ajusta uma regra do AutoMod.')
        .addStringOption(o =>
          o.setName('tipo')
            .setDescription('Tipo de proteção')
            .setRequired(true)
            .addChoices(
              { name: 'Anti-Spam / Flood', value: 'anti_spam' },
              { name: 'Bloqueio de Convites (Anti-Invite)', value: 'anti_invite' },
              { name: 'Bloqueio de Links (Anti-Link)', value: 'anti_link' },
              { name: 'Anti-Caps Lock Excessivo', value: 'anti_caps' },
              { name: 'Anti-Menções em Massa', value: 'anti_mass_mention' }
            )
        )
        .addStringOption(o =>
          o.setName('acao')
            .setDescription('Ação punitiva a ser aplicada')
            .setRequired(true)
            .addChoices(
              { name: 'Apenas Deletar Mensagem', value: 'delete' },
              { name: 'Deletar e Aplicar Castigo (Timeout 10m)', value: 'timeout' },
              { name: 'Deletar e Expulsar (Kick)', value: 'kick' }
            )
        )
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'AutoMod indisponível.', ephemeral: true });

    const type = interaction.options.getString('tipo');
    const action = interaction.options.getString('acao');
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    await native.automod.setRule(interaction.guildId, { ruleType: type, enabled: true, action }, ctx);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'REGRA AUTOMOD ATIVADA',
          body: `Regra **\`${type}\`** configurada com sucesso.
Ação ao detectar infração: **\`${action.toUpperCase()}\`**.`,
        }),
      ],
    });
  },
};
