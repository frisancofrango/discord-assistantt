import { authorize, audit } from './core.js';
import crypto from 'node:crypto';

/**
 * Calculates CRC16 CCITT for standard EMVCo PIX strings according to BCB spec.
 */
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Formats EMV TLV (Type-Length-Value) field
 */
function formatTlv(id, value) {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

export class PixService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  generatePixPayload({ pixKey, merchantName = 'AZURE STORE', merchantCity = 'BRASILIA', amount, txId }) {
    const key = pixKey || 'pagamento@azurestore.com.br';
    const name = merchantName.slice(0, 25).toUpperCase();
    const city = merchantCity.slice(0, 15).toUpperCase();
    const safeTxId = (txId || crypto.randomBytes(6).toString('hex')).slice(0, 25);

    const gui = formatTlv('00', 'br.gov.bcb.pix');
    const chave = formatTlv('01', key);
    const merchantAccountInfo = formatTlv('26', `${gui}${chave}`);

    const payloadFormat = formatTlv('00', '01');
    const merchantCategory = formatTlv('52', '0000');
    const transactionCurrency = formatTlv('53', '986'); // 986 = BRL
    const transactionAmount = formatTlv('54', Number(amount).toFixed(2));
    const countryCode = formatTlv('58', 'BR');
    const merchantNameField = formatTlv('59', name);
    const merchantCityField = formatTlv('60', city);

    const txIdField = formatTlv('05', safeTxId);
    const additionalDataField = formatTlv('62', txIdField);

    const raw = `${payloadFormat}${merchantAccountInfo}${merchantCategory}${transactionCurrency}${transactionAmount}${countryCode}${merchantNameField}${merchantCityField}${additionalDataField}6304`;
    const crc = crc16(raw);

    return `${raw}${crc}`;
  }

  async createInvoice({ orderId, amountMinor, currency = 'BRL', description = 'Digital Order', guildId = 'default' }) {
    const amountBrl = (amountMinor / 100).toFixed(2);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    const invoiceId = `pix_${crypto.randomBytes(6).toString('hex')}`;

    const config = await this.getConfig(guildId);
    const pixKey = config?.pix_key || 'suporte@azurestore.com.br';

    const copiaECola = this.generatePixPayload({
      pixKey,
      merchantName: 'AZURE DIGITAL',
      merchantCity: 'SAO PAULO',
      amount: amountBrl,
      txId: invoiceId.slice(4),
    });

    const row = (
      await this.db.query(
        `INSERT INTO pix_invoices (id, order_id, external_reference, qr_code, amount_minor, currency, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
         RETURNING *`,
        [invoiceId, orderId, `order:${orderId}`, copiaECola, amountMinor, currency, expiresAt]
      )
    ).rows[0];

    return {
      id: row.id,
      orderId: row.order_id,
      qrCode: row.qr_code,
      amountMinor: row.amount_minor,
      currency: row.currency,
      status: row.status,
      expiresAt: row.expires_at,
    };
  }

  async confirmPayment(pixInvoiceId, metadata = {}) {
    const row = (
      await this.db.query(
        `UPDATE pix_invoices
         SET status = 'approved', paid_at = now()
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [pixInvoiceId]
      )
    ).rows[0];

    if (!row) {
      const existing = (await this.db.query(`SELECT * FROM pix_invoices WHERE id = $1`, [pixInvoiceId])).rows[0];
      return existing;
    }

    // Fulfill underlying commerce order
    await this.db.query(
      `UPDATE orders SET status = 'fulfilled', updated_at = now() WHERE id = $1`,
      [row.order_id]
    );

    return row;
  }

  async getInvoice(pixInvoiceId) {
    const row = (await this.db.query(`SELECT * FROM pix_invoices WHERE id = $1`, [pixInvoiceId])).rows[0];
    return row;
  }

  async setConfig(guildId, { accessToken, pixKey, webhookSecret, enabled = true }, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'low', financial: true, permissions: ['ManageGuild'] });

    const row = (
      await this.db.query(
        `INSERT INTO guild_pix_config (guild_id, access_token, pix_key, webhook_secret, enabled, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (guild_id) DO UPDATE SET
           access_token = COALESCE(EXCLUDED.access_token, guild_pix_config.access_token),
           pix_key = COALESCE(EXCLUDED.pix_key, guild_pix_config.pix_key),
           webhook_secret = COALESCE(EXCLUDED.webhook_secret, guild_pix_config.webhook_secret),
           enabled = EXCLUDED.enabled,
           updated_at = now()
         RETURNING *`,
        [guildId, accessToken, pixKey, webhookSecret, enabled]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'pix.config_update',
      domain: 'commerce',
      risk: 'standard',
      metadata: { guildId, pixKey, enabled },
    });

    return row;
  }

  async getConfig(guildId) {
    const row = (await this.db.query(`SELECT * FROM guild_pix_config WHERE guild_id = $1`, [guildId])).rows[0];
    return row;
  }
}
