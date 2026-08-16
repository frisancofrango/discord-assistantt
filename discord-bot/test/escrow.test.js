import test from 'node:test';
import assert from 'node:assert/strict';
import { EscrowService } from '../src/native/escrow.js';

function createMockEscrowDb() {
  const deals = [];

  return {
    deals,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');

      if (lower.includes('insert into escrow_deals')) {
        const row = {
          id: `esc_${deals.length + 1}`,
          guild_id: params[0],
          buyer_id: params[1],
          seller_id: params[2],
          amount_minor: params[3],
          currency: params[4],
          terms: params[5],
          status: 'pending_deposit',
          created_at: new Date(),
          updated_at: new Date(),
          resolved_at: null,
        };
        deals.push(row);
        return { rows: [row] };
      }

      if (lower.includes('select * from escrow_deals where id = $1')) {
        const row = deals.find((d) => d.id === params[0]);
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('update escrow_deals set status = $1')) {
        const row = deals.find((d) => d.id === params[1]);
        if (row) {
          row.status = params[0];
          row.updated_at = new Date();
        }
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('update escrow_deals set status = \'funds_locked\'')) {
        const row = deals.find((d) => d.id === params[0]);
        if (row) row.status = 'funds_locked';
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('update escrow_deals set status = \'delivered\'')) {
        const row = deals.find((d) => d.id === params[0]);
        if (row) row.status = 'delivered';
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('update escrow_deals set status = \'completed\'')) {
        const row = deals.find((d) => d.id === params[0]);
        if (row) {
          row.status = 'completed';
          row.resolved_at = new Date();
        }
        return { rows: row ? [row] : [] };
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
  actor: { id: 'buyer_1', authenticated: true, guildMember: true, isOwner: false, permissions: ['SendMessages'] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('EscrowService: full trade lifecycle (create -> fund -> deliver -> release)', async () => {
  const db = createMockEscrowDb();
  const svc = new EscrowService({ db });

  let walletWithdrawn = null;
  let walletDeposited = null;
  const mockWallet = {
    async withdraw(data) {
      walletWithdrawn = data;
    },
    async deposit(data) {
      walletDeposited = data;
    },
  };

  // 1. Create deal
  const deal = await svc.createDeal(
    {
      guildId: 'g1',
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      amountMinor: 5000,
      terms: 'Trade 1000 Robux for VIP role',
    },
    mockCtx
  );
  assert.equal(deal.status, 'pending_deposit');
  assert.equal(deal.amountMinor, 5000);

  // 2. Fund deal
  const funded = await svc.depositAndLock({ dealId: deal.id, buyerId: 'buyer_1', walletService: mockWallet }, mockCtx);
  assert.equal(funded.status, 'funds_locked');
  assert.equal(walletWithdrawn?.amountMinor, 5000);

  // 3. Mark delivered
  const delivered = await svc.markDelivered({ dealId: deal.id, sellerId: 'seller_1' }, mockCtx);
  assert.equal(delivered.status, 'delivered');

  // 4. Release escrow
  const completed = await svc.releaseEscrow({ dealId: deal.id, buyerId: 'buyer_1', walletService: mockWallet }, mockCtx);
  assert.equal(completed.status, 'completed');
  assert.equal(walletDeposited?.memberId, 'seller_1');
  assert.equal(walletDeposited?.amountMinor, 5000);
});
