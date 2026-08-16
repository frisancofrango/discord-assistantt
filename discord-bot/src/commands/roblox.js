import { SlashCommandBuilder } from 'discord.js';
import { robloxCalculatorPanel, panel, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Calculadora de taxas Roblox 70/30 e vínculo de conta.')
    .addSubcommand(sc =>
      sc.setName('taxa')
        .setDescription('Calcula o valor com retenção de 30% da taxa da plataforma Roblox.')
        .addIntegerOption(o => o.setName('robux_liquido').setDescription('Quanto de Robux você quer receber líquido').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sc =>
      sc.setName('vincular')
        .setDescription('Vincula seu usuário do Roblox ao seu perfil do Discord.')
        .addStringOption(o => o.setName('usuario_roblox').setDescription('Seu nick de usuário no Roblox').setRequired(true))
    ),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Módulo Roblox indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'taxa') {
      const net = interaction.options.getInteger('robux_liquido');
      const calc = native.roblox.calculateFee(net, true);
      return interaction.reply({
        flags: V2,
        ephemeral: true,
        components: [
          robloxCalculatorPanel({
            netRobux: calc.targetNet,
            grossPrice: calc.grossPrice,
            feeAmount: calc.feeAmount,
            effectiveNet: calc.effectiveNet,
            isNet: true,
          }),
        ],
      });
    }

    const username = interaction.options.getString('usuario_roblox');
    const link = await native.roblox.linkAccount(interaction.guildId, interaction.user.id, username, ctx);

    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [panel({ title: 'CONTA VINCULADA', body: `Sincronizado com o usuário do Roblox **${link.robloxUsername}** (\`${link.robloxId}\`).` })],
    });
  },
};
