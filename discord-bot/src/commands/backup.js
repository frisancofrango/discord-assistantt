import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, button, V2 } from '../ui/theme.js';

export default {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Snapshots estruturais do servidor e recuperação de membros via OAuth2.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('criar').setDescription('Cria um snapshot completo dos canais, cargos e permissões.'))
    .addSubcommand(sc => sc.setName('listar').setDescription('Lista todos os backups salvos do servidor.'))
    .addSubcommand(sc => sc.setName('oauth').setDescription('Exibe métricas de membros sincronizados com autorização OAuth2.')),

  async execute(interaction, client) {
    const native = client.runtime?.native;
    if (!native) return interaction.reply({ content: 'Sistema de backup indisponível.', ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctx = { actorId: interaction.user.id, guildId: interaction.guildId };

    if (sub === 'criar') {
      await interaction.deferReply({ ephemeral: true });
      const snap = await native.backup.createSnapshot(interaction.guild, interaction.user.id, `Backup_${Date.now()}`, ctx);
      return interaction.editReply({
        flags: V2,
        components: [
          panel({
            title: 'BACKUP CRIADO',
            body: `Snapshot **\`${snap.name}\`** salvo com sucesso.
Canais salvos: **${snap.channelCount}** | Cargos: **${snap.roleCount}**.`,
          }),
        ],
      });
    }

    if (sub === 'listar') {
      const list = await native.backup.listBackups(interaction.guildId);
      const lines = list.map(b => `> **\`${b.id}\`** — **${b.name}** (${b.channelCount} ch, ${b.roleCount} roles)`).join('\n') || 'Nenhum backup salvo.';
      return interaction.reply({ flags: V2, ephemeral: true, components: [panel({ title: 'BACKUPS SALVOS', body: lines })] });
    }

    const stats = await native.backup.getOAuthStats(interaction.guildId);
    return interaction.reply({
      flags: V2,
      ephemeral: true,
      components: [
        panel({
          title: 'ESTATÍSTICAS OAUTH2',
          body:
            `> **Total de Membros Salvos:** **${stats.totalMembersBackedUp}**
` +
            `> **Tokens Ativos Prontos:** **${stats.activeTokensCount}**
` +
            `> **Taxa de Prontidão:** 100% sincronizado`,
        }),
      ],
    });
  },
};
