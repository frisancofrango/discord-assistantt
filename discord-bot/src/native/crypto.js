import { NativeError } from './core.js';

export const CRYPTO_RATES = {
  BTC: 95000,
  LTC: 110,
  USDT_TRC20: 1,
  SOL: 220,
};

export const SAMPLE_ADDRESSES = {
  BTC: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  LTC: 'ltc1qrg29wsk6r7e2yfl8k2g95yvhq85w9s4n3p5x2t',
  USDT_TRC20: 'TX8r5K2W1bN84V2qL5mZ81k9g7T4Y3V91p',
  SOL: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
};

export class CryptoService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async createInvoice({ orderId, cryptoCurrency, amountUsdMinor }) {
    if (!CRYPTO_RATES[cryptoCurrency]) {
      throw new NativeError('invalid_input', `Unsupported crypto currency ${cryptoCurrency}`);
    }

    const rate = CRYPTO_RATES[cryptoCurrency];
    const usdAmount = Number(amountUsdMinor) / 100;
    const cryptoAmount = Number((usdAmount / rate).toFixed(cryptoCurrency === 'USDT_TRC20' ? 2 : 6));
    const depositAddress = SAMPLE_ADDRESSES[cryptoCurrency];
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    const row = (
      await this.db.query(
        `INSERT INTO crypto_invoices (order_id, crypto_currency, deposit_address, crypto_amount, status, expires_at)
         VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
        [orderId, cryptoCurrency, depositAddress, cryptoAmount, expiresAt]
      )
    ).rows[0];

    return {
      id: row.id,
      orderId: row.order_id,
      cryptoCurrency: row.crypto_currency,
      depositAddress: row.deposit_address,
      cryptoAmount: Number(row.crypto_amount),
      status: row.status,
      expiresAt: row.expires_at,
    };
  }

  async getInvoice(invoiceId) {
    const row = (await this.db.query(`SELECT * FROM crypto_invoices WHERE id = $1`, [invoiceId])).rows[0];
    return row
      ? {
          id: row.id,
          orderId: row.order_id,
          cryptoCurrency: row.crypto_currency,
          depositAddress: row.deposit_address,
          cryptoAmount: Number(row.crypto_amount),
          status: row.status,
          expiresAt: row.expires_at,
        }
      : null;
  }

  async confirmPayment(invoiceId) {
    const row = (
      await this.db.query(
        `UPDATE crypto_invoices SET status = 'paid' WHERE id = $1 RETURNING *`,
        [invoiceId]
      )
    ).rows[0];
    if (!row) throw new NativeError('not_found', 'Invoice not found');

    await this.db.query(
      `UPDATE orders SET status = 'fulfilled', provider = 'crypto', provider_reference = $2, updated_at = now() WHERE id = $1`,
      [row.order_id, `crypto:${row.crypto_currency}:${row.id}`]
    );

    return {
      id: row.id,
      orderId: row.order_id,
      status: 'paid',
    };
  }
}
