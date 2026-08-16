import test from 'node:test';
import assert from 'node:assert/strict';
import { LicenseService } from '../src/native/license.js';

function createMockLicenseDb() {
  const keys = [];

  const dbClient = {
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');
      if (lower.startsWith('begin') || lower.startsWith('commit') || lower.startsWith('rollback')) {
        return { rows: [] };
      }

      if (lower.includes('from product_license_keys where variant_id = $1 and not is_used')) {
        const row = keys.find((k) => k.variant_id === params[0] && !k.is_used);
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('update product_license_keys set is_used = true')) {
        const row = keys.find((k) => k.id === params[0]);
        if (row) {
          row.is_used = true;
          row.order_id = params[1];
          row.redeemed_by = params[2];
        }
        return { rows: [row] };
      }

      return { rows: [] };
    },
    release() {},
  };

  return {
    keys,
    async connect() {
      return dbClient;
    },
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');

      if (lower.includes('insert into product_license_keys')) {
        const exists = keys.some((k) => k.variant_id === params[0] && k.license_key === params[1]);
        if (!exists) {
          const row = {
            id: `k_${keys.length + 1}`,
            variant_id: params[0],
            license_key: params[1],
            is_used: false,
            order_id: null,
            redeemed_by: null,
            created_at: new Date(),
          };
          keys.push(row);
          return { rowCount: 1, rows: [row] };
        }
        return { rowCount: 0, rows: [] };
      }

      if (lower.includes('from product_license_keys where variant_id = $1 and not is_used')) {
        const count = keys.filter((k) => k.variant_id === params[0] && !k.is_used).length;
        return { rows: [{ count }] };
      }

      if (lower.includes('from product_license_keys where variant_id = $1')) {
        const count = keys.filter((k) => k.variant_id === params[0]).length;
        return { rows: [{ count }] };
      }

      if (lower.includes('update product_variants set stock = $1')) {
        return { rows: [] };
      }

      if (lower.includes('select id, variant_id, license_key, is_used')) {
        const rows = keys.filter((k) => k.variant_id === params[0]);
        return { rows };
      }

      if (lower.includes('insert into audit')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true, permissions: ['ManageGuild'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('LicenseService: addKeys inserts batch and updates stock', async () => {
  const db = createMockLicenseDb();
  const svc = new LicenseService({ db });

  const res = await svc.addKeys('v1', ['KEY-AAAA-1111', 'KEY-BBBB-2222', 'KEY-CCCC-3333'], mockCtx);
  assert.equal(res.addedCount, 3);
  assert.equal(res.totalUnused, 3);

  const pool = await svc.getKeyPool('v1');
  assert.equal(pool.totalKeys, 3);
  assert.equal(pool.unusedKeys, 3);
  assert.equal(pool.claimedKeys, 0);
});

test('LicenseService: claimKey claims unused key atomically', async () => {
  const db = createMockLicenseDb();
  const svc = new LicenseService({ db });

  await svc.addKeys('v1', ['DISCORD-NITRO-1234', 'DISCORD-NITRO-5678'], mockCtx);

  const key1 = await svc.claimKey('v1', 'ord_1', 'user_100');
  assert.equal(key1, 'DISCORD-NITRO-1234');

  const pool = await svc.getKeyPool('v1');
  assert.equal(pool.unusedKeys, 1);
  assert.equal(pool.claimedKeys, 1);
});
