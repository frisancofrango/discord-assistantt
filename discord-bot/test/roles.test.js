import test from 'node:test';
import assert from 'node:assert/strict';
import { RoleService } from '../src/native/roles.js';

function createMockRolesDb() {
  const menus = [];
  return {
    menus,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes('insert into role_menus')) {
        const row = { id: `rmu_${menus.length + 1}`, guild_id: params[0], title: params[1], description: params[2], roles: params[3] };
        menus.push(row);
        return { rows: [row] };
      }
      if (lower.includes('select * from role_menus')) {
        return { rows: menus };
      }
      return { rows: [] };
    },
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'admin_1', authenticated: true, guildMember: true, isOwner: true, permissions: ['ManageRoles'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('RoleService: createMenu and toggleRole', async () => {
  const db = createMockRolesDb();
  const svc = new RoleService({ db });

  const menu = await svc.createMenu(
    'g1',
    {
      title: 'Notification Roles',
      description: 'Click to toggle announcements',
      roles: [{ id: 'role_ann', name: 'Announcements' }],
    },
    mockCtx
  );

  assert.equal(menu.title, 'Notification Roles');
  assert.equal(menu.roles.length, 1);

  // Mock member role toggle
  const roleSet = new Set();
  const mockMember = {
    roles: {
      cache: roleSet,
      async add(id) {
        roleSet.add(id);
      },
      async remove(id) {
        roleSet.delete(id);
      },
    },
  };

  const res1 = await svc.toggleRole(mockMember, 'role_ann');
  assert.equal(res1.added, true);
  assert.equal(roleSet.has('role_ann'), true);

  const res2 = await svc.toggleRole(mockMember, 'role_ann');
  assert.equal(res2.added, false);
  assert.equal(roleSet.has('role_ann'), false);
});
