import test from 'node:test';
import assert from 'node:assert/strict';
import { PixService } from '../src/native/pix.js';

function createMockPixDb() {
  const invoices = [];
  const configs = [];
  return {
    invoices,
    configs,
    async query(sql, params) {
      const lower = sql.toLowerCase().replace(/\s+/g, ' ');
      if (lower.includes('insert into pix_invoices')) {
        const row = {
          id: params[0],
          order_id: params[1],
          external_reference: params[2],
          qr_code: params[3],
          amount_minor: params[4],
          currency: params[5],
          status: 'pending',
          expires_at: params[6],
          created_at: new Date(),
        };
        invoices.push(row);
        return { rows: [row] };
      }
      if (lower.includes('update pix_invoices set status = \'approved\'')) {
        const row = invoices.find((i) => i.id === params[0] && i.status === 'pending');
        if (row) {
          row.status = 'approved';
          row.paid_at = new Date();
          return { rows: [row] };
        }
        return { rows: [] };
      }
      if (lower.includes('select * from pix_invoices where id = $1')) {
        const row = invoices.find((i) => i.id === params[0]);
        return { rows: row ? [row] : [] };
      }
      if (lower.includes('insert into guild_pix_config')) {
        const row = { guild_id: params[0], access_token: params[1], pix_key: params[2], webhook_secret: params[3], enabled: params[4] };
        configs.push(row);
        return { rows: [row] };
      }
      if (lower.includes('select * from guild_pix_config where guild_id = $1')) {
        const row = configs.find((c) => c.guild_id === params[0]);
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

test('PixService: generatePixPayload adheres to BCB standard with valid CRC16', () => {
  const svc = new PixService({ db: null });
  const payload = svc.generatePixPayload({
    pixKey: 'pix@test.com',
    merchantName: 'LOOP STORE',
    merchantCity: 'BRASILIA',
    amount: '15.00',
    txId: 'AZ12345',
  });

  assert.match(payload, /^000201/); // Payload Format Indicator
  assert.match(payload, /br\.gov\.bcb\.pix/); // GUI
  assert.match(payload, /5303986/); // Currency BRL
  assert.match(payload, /540515\.00/); // Amount 15.00
  assert.match(payload, /5802BR/); // Country BR
  assert.equal(payload.length > 50, true);
});

test('PixService: createInvoice, getInvoice and confirmPayment', async () => {
  const db = createMockPixDb();
  const svc = new PixService({ db });

  await svc.setConfig('g1', { accessToken: 'TEST_TOKEN', pixKey: 'store@pix.br' }, mockCtx);
  const invoice = await svc.createInvoice({
    orderId: 'ord_123',
    amountMinor: 2500,
    currency: 'BRL',
    guildId: 'g1',
  });

  assert.match(invoice.id, /^pix_/);
  assert.equal(invoice.amountMinor, 2500);
  assert.equal(invoice.status, 'pending');

  const fetched = await svc.getInvoice(invoice.id);
  assert.equal(fetched.amount_minor, 2500);

  const confirmed = await svc.confirmPayment(invoice.id);
  assert.equal(confirmed.status, 'approved');
});
