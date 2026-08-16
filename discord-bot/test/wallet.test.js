import test from 'node:test';
import assert from 'node:assert/strict';
import { WalletService } from '../src/native/wallet.js';

function createMockDb() {
  const wallets = new Map();
  const transactions = [];
  const idempotency = new Map();

  const queryFn = async (sql, params = []) => {
    const lower = sql.toLowerCase();
    if (lower === 'begin' || lower === 'commit' || lower === 'rollback') return { rows: [] };

    if (lower.includes('select * from native_idempotency')) {
      const key = `${params[0]}:${params[1]}`;
      const row = idempotency.get(key);
      return { rows: row ? [row] : [] };
    }

    if (lower.includes('insert into native_idempotency')) {
      const key = `${params[0]}:${params[1]}`;
      const row = { scope: params[0], idempotency_key: params[1], input_hash: params[2], status: params[3], result: null };
      idempotency.set(key, row);
      return { rows: [row] };
    }

    if (lower.includes('update native_idempotency')) {
      const key = `${params[0]}:${params[1]}`;
      const row = idempotency.get(key) || {};
      row.status = 'completed';
      row.result = params[2] ? JSON.parse(params[2]) : null;
      idempotency.set(key, row);
      return { rows: [row] };
    }

    if (lower.includes('select * from wallets where guild_id = $1 and member_id = $2 and currency = $3')) {
      const key = `${params[0]}:${params[1]}:${params[2]}`;
      const row = wallets.get(key);
      return { rows: row ? [{ ...row }] : [] };
    }

    if (lower.includes('insert into wallets')) {
      const key = `${params[0]}:${params[1]}:${params[2]}`;
      let row = wallets.get(key);
      if (!row) {
        row = {
          id: `w-${params[1]}`,
          guild_id: params[0],
          member_id: params[1],
          currency: params[2],
          balance_minor: 0,
          locked_minor: 0,
          created_at: new Date(),
          updated_at: new Date(),
        };
        wallets.set(key, row);
      }
      return { rows: [{ ...row }] };
    }

    if (lower.includes('update wallets set balance_minor = $1')) {
      for (const [key, w] of wallets.entries()) {
        if (w.id === params[1]) {
          w.balance_minor = params[0];
          w.updated_at = new Date();
          return { rows: [{ ...w }] };
        }
      }
      return { rows: [] };
    }

    if (lower.includes('insert into wallet_transactions')) {
      let type = 'unknown';
      if (lower.includes("'deposit'")) type = 'deposit';
      else if (lower.includes("'withdrawal'")) type = 'withdrawal';
      else if (lower.includes("'transfer_out'")) type = 'transfer_out';
      else if (lower.includes("'transfer_in'")) type = 'transfer_in';
      else if (lower.includes("'payment'")) type = 'payment';

      const row = {
        id: `tx-${transactions.length + 1}`,
        wallet_id: params[0],
        guild_id: params[1],
        member_id: params[2],
        type,
        amount_minor: params[3],
        currency: params[4],
        balance_after_minor: params[5],
        reference_id: params[6],
        metadata: typeof params[7] === 'string' ? JSON.parse(params[7]) : params[7],
        created_at: new Date(),
      };
      transactions.push(row);
      return { rows: [{ ...row }] };
    }

    if (lower.includes('select * from wallet_transactions')) {
      const rows = transactions.filter((t) => t.guild_id === params[0] && t.member_id === params[1]);
      return { rows };
    }

    if (lower.includes('insert into audit')) {
      return { rows: [] };
    }

    return { rows: [] };
  };

  return {
    wallets,
    transactions,
    idempotency,
    async connect() {
      return {
        query: queryFn,
        release() {},
      };
    },
    query: queryFn,
  };
}

const mockCtx = {
  guildId: 'g1',
  actor: { id: 'u1', authenticated: true, guildMember: true, isOwner: true, permissions: [] },
  autonomy: 'operator',
  approval: { status: 'approved' },
};

test('WalletService: getWallet initializes default wallet with 0 balance', async () => {
  const db = createMockDb();
  const svc = new WalletService({ db });

  const wallet = await svc.getWallet('g1', 'u1', 'USD');
  assert.equal(wallet.balanceMinor, 0);
  assert.equal(wallet.availableMinor, 0);
  assert.equal(wallet.currency, 'USD');
  assert.equal(wallet.memberId, 'u1');
});

test('WalletService: deposit credits balance and logs transaction', async () => {
  const db = createMockDb();
  const svc = new WalletService({ db });

  const result = await svc.deposit(
    {
      guildId: 'g1',
      memberId: 'u1',
      amountMinor: 2500,
      currency: 'USD',
      reference: 'stripe_charge_123',
    },
    mockCtx
  );

  assert.equal(result.balanceMinor, 2500);
  assert.equal(result.type, 'deposit');

  const wallet = await svc.getWallet('g1', 'u1', 'USD');
  assert.equal(wallet.balanceMinor, 2500);
  assert.equal(wallet.availableMinor, 2500);
});

test('WalletService: withdraw debits balance and fails when funds are insufficient', async () => {
  const db = createMockDb();
  const svc = new WalletService({ db });

  await svc.deposit({ guildId: 'g1', memberId: 'u1', amountMinor: 5000, currency: 'USD' }, mockCtx);

  const withdrawResult = await svc.withdraw(
    { guildId: 'g1', memberId: 'u1', amountMinor: 2000, currency: 'USD', destination: 'paypal' },
    mockCtx
  );
  assert.equal(withdrawResult.balanceMinor, 3000);

  await assert.rejects(
    () => svc.withdraw({ guildId: 'g1', memberId: 'u1', amountMinor: 4000, currency: 'USD' }, mockCtx),
    (err) => err.code === 'insufficient_funds'
  );
});

test('WalletService: transfer moves balance atomically between sender and recipient', async () => {
  const db = createMockDb();
  const svc = new WalletService({ db });

  await svc.deposit({ guildId: 'g1', memberId: 'u1', amountMinor: 10000, currency: 'USD' }, mockCtx);

  const transfer = await svc.transfer(
    { guildId: 'g1', senderId: 'u1', recipientId: 'u2', amountMinor: 3500, currency: 'USD' },
    mockCtx
  );

  assert.equal(transfer.senderBalanceMinor, 6500);
  assert.equal(transfer.recipientBalanceMinor, 3500);

  const w1 = await svc.getWallet('g1', 'u1', 'USD');
  const w2 = await svc.getWallet('g1', 'u2', 'USD');

  assert.equal(w1.availableMinor, 6500);
  assert.equal(w2.availableMinor, 3500);

  const history1 = await svc.history('g1', 'u1', 10);
  assert.ok(history1.length >= 2);
  const tx = history1.find((t) => t.type === 'transfer_out');
  assert.ok(tx);
  assert.equal(tx.amountMinor, -3500);
});
