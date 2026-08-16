import { authorize, audit } from './core.js';

export class RoleService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async createMenu(guildId, { title, description, roles }, ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'medium', permissions: ['ManageRoles'] });

    const row = (
      await this.db.query(
        `INSERT INTO role_menus (guild_id, title, description, roles)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [guildId, title, description, JSON.stringify(roles)]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'role_menu.create',
      domain: 'moderation',
      risk: 'low',
      metadata: { menuId: row.id, title, roleCount: roles.length },
    });

    return {
      id: row.id,
      guildId: row.guild_id,
      title: row.title,
      description: row.description,
      roles: typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles,
    };
  }

  async toggleRole(member, roleId) {
    const hasRole = member.roles.cache.has(roleId);
    if (hasRole) {
      await member.roles.remove(roleId, 'Self-service role removal');
      return { added: false, roleId };
    } else {
      await member.roles.add(roleId, 'Self-service role addition');
      return { added: true, roleId };
    }
  }

  async listMenus(guildId) {
    const rows = (await this.db.query(`SELECT * FROM role_menus WHERE guild_id = $1 ORDER BY created_at DESC`, [guildId])).rows;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      roles: typeof r.roles === 'string' ? JSON.parse(r.roles) : r.roles,
    }));
  }
}
