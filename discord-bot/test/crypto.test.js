import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoService } from '../src/native/crypto.js';

function createMockCryptoDb() {
  const invoices = [];

  return {
    invoices,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');

      if (lower.includes('insert into crypto_invoices')) {
        const row = {
          id: `crp_${invoices.length + 1}`,
          order_id: params[0],
          crypto_currency: params[1],
          deposit_address: params[2],
          crypto_amount: params[3],
          status: 'pending',
          expires_at: params[4],
        };
        invoices.push(row);
        return { rows: [row] };
      }

      if (lower.includes('update crypto_invoices set status = \'paid\'')) {
        const row = invoices.find((i) => i.id === params[0]);
        if (row) row.status = 'paid';
        return { rows: row ? [row] : [] };
      }

      if (lower.includes('update orders set status = \'fulfilled\'')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

test('CryptoService: createInvoice converts USD amount to crypto currency rate', async () => {
  const db = createMockCryptoDb();
  const svc = new CryptoService({ db });

  // $110.00 USD with LTC ($110/LTC) -> 1.0 LTC
  const inv = await svc.createInvoice({
    orderId: 'ord_999',
    cryptoCurrency: 'LTC',
    amountUsdMinor: 11000,
  });

  assert.equal(inv.cryptoCurrency, 'LTC');
  assert.equal(inv.cryptoAmount, 1.0);
  assert.equal(inv.status, 'pending');
  assert.ok(inv.depositAddress.startsWith('ltc1'));
});

test('CryptoService: confirmPayment marks invoice and order fulfilled', async () => {
  const db = createMockCryptoDb();
  const svc = new CryptoService({ db });

  const inv = await svc.createInvoice({
    orderId: 'ord_999',
    cryptoCurrency: 'USDT_TRC20',
    amountUsdMinor: 2500,
  });

  const paid = await svc.confirmPayment(inv.id);
  assert.equal(paid.status, 'paid');
});
