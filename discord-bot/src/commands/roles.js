import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { panel, notice, V2, button } from '../ui/theme.js';
import { actorContext } from '../native/core.js';

export default {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Interactive self-service button roles and vanity role assignment.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName('menu')
        .setDescription('Create an interactive self-service role button panel.')
        .addStringOption((o) =>
          o.setName('title').setDescription('Menu title (e.g. Notification Roles)').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('description').setDescription('Menu instructions').setRequired(true)
        )
        .addRoleOption((o) =>
          o.setName('role1').setDescription('First selectable role').setRequired(true)
        )
        .addRoleOption((o) =>
          o.setName('role2').setDescription('Second selectable role').setRequired(false)
        )
        .addRoleOption((o) =>
          o.setName('role3').setDescription('Third selectable role').setRequired(false)
        )
        .addRoleOption((o) =>
          o.setName('role4').setDescription('Fourth selectable role').setRequired(false)
        )
        .addRoleOption((o) =>
          o.setName('role5').setDescription('Fifth selectable role').setRequired(false)
        )
    ),

  async execute(interaction, client) {
    const roleService = client.runtime?.native?.roles;
    if (!roleService) {
      return interaction.reply({ content: 'Role service is unavailable.', ephemeral: true });
    }

    const title = interaction.options.getString('title', true);
    const desc = interaction.options.getString('description', true);

    const roles = [];
    for (let i = 1; i <= 5; i++) {
      const r = interaction.options.getRole(`role${i}`);
      if (r) roles.push({ id: r.id, name: r.name });
    }

    const ctx = actorContext(interaction);
    const menu = await roleService.createMenu(interaction.guildId, { title, description: desc, roles }, ctx);

    const buttons = roles.map((r) => button.neutral(`role:toggle:${r.id}`, `🏷️ ${r.name}`));

    return interaction.reply({
      flags: V2,
      components: [
        panel({
          title: `🎭 ${menu.title.toUpperCase()}`,
          subtitle: 'Click any button to add or remove roles',
          body: menu.description,
          buttons,
          footer: 'Self-Service Role Manager',
        }),
      ],
    });
  },
};
