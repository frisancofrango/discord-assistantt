import test from 'node:test';
import assert from 'node:assert/strict';
import { VendorService } from '../src/native/vendor.js';

function createMockVendorDb() {
  const vendors = [];
  return {
    vendors,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes('insert into product_vendors')) {
        const row = { product_id: params[0], vendor_user_id: params[1], commission_percent: params[2] };
        vendors.push(row);
        return { rows: [row] };
      }
      if (lower.includes('select * from product_vendors where product_id = $1')) {
        const row = vendors.find((v) => v.product_id === params[0]);
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    },
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'admin_1', authenticated: true, guildMember: true, isOwner: true, permissions: ['ManageGuild'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('VendorService: setVendor, getVendor, and processVendorSplit', async () => {
  const db = createMockVendorDb();
  const svc = new VendorService({ db });

  await svc.setVendor('prod_nitro', 'vendor_999', 15, mockCtx); // 15% platform commission cut
  const vendor = await svc.getVendor('prod_nitro');
  assert.equal(vendor.vendor_user_id, 'vendor_999');
  assert.equal(vendor.commission_percent, 15);

  let deposited = null;
  const mockWalletService = {
    async deposit(payload) {
      deposited = payload;
      return { balanceMinor: payload.amountMinor };
    },
  };

  const split = await svc.processVendorSplit({
    productId: 'prod_nitro',
    guildId: 'g1',
    totalAmountMinor: 10000, // R$ 100,00
    currency: 'BRL',
    walletService: mockWalletService,
    ctx: mockCtx,
  });

  assert.equal(split.platformCutMinor, 1500); // R$ 15,00
  assert.equal(split.vendorEarningsMinor, 8500); // R$ 85,00
  assert.equal(deposited.amountMinor, 8500);
  assert.equal(deposited.memberId, 'vendor_999');
});
