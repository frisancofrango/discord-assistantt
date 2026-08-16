import { NativeError, authorize, audit, idempotent, transaction } from './core.js';

export class WalletService {
  constructor({ db, analytics }) {
    this.db = db;
    this.analytics = analytics;
  }

  async getWallet(guildId, memberId, currency = 'USD') {
    const cur = (currency || 'USD').toUpperCase();
    let row = (await this.db.query(
      `SELECT * FROM wallets WHERE guild_id = $1 AND member_id = $2 AND currency = $3`,
      [guildId, memberId, cur]
    )).rows[0];

    if (!row) {
      row = (await this.db.query(
        `INSERT INTO wallets (guild_id, member_id, currency, balance_minor, locked_minor)
         VALUES ($1, $2, $3, 0, 0)
         ON CONFLICT (guild_id, member_id, currency) DO UPDATE SET updated_at = now()
         RETURNING *`,
        [guildId, memberId, cur]
      )).rows[0];
    }

    return {
      id: row.id,
      guildId: row.guild_id,
      memberId: row.member_id,
      balanceMinor: Number(row.balance_minor),
      currency: row.currency,
      lockedMinor: Number(row.locked_minor),
      availableMinor: Number(row.balance_minor) - Number(row.locked_minor),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async deposit({ guildId, memberId, amountMinor, currency = 'USD', reference, metadata = {}, idempotencyKey }, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'medium', financial: true });
    const amt = Number(amountMinor);
    if (!amt || amt <= 0) throw new NativeError('invalid_amount', 'Deposit amount must be positive');
    const cur = currency.toUpperCase();

    return idempotent(this.db, 'wallet.deposit', idempotencyKey || `deposit:${guildId}:${memberId}:${Date.now()}`, { guildId, memberId, amt, cur, reference }, async (c) => {
      let wallet = (await c.query(
        `SELECT * FROM wallets WHERE guild_id = $1 AND member_id = $2 AND currency = $3 FOR UPDATE`,
        [guildId, memberId, cur]
      )).rows[0];

      if (!wallet) {
        wallet = (await c.query(
          `INSERT INTO wallets (guild_id, member_id, currency, balance_minor, locked_minor)
           VALUES ($1, $2, $3, 0, 0) RETURNING *`,
          [guildId, memberId, cur]
        )).rows[0];
      }

      const newBalance = Number(wallet.balance_minor) + amt;
      const updatedWallet = (await c.query(
        `UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [newBalance, wallet.id]
      )).rows[0];

      const txRow = (await c.query(
        `INSERT INTO wallet_transactions (wallet_id, guild_id, member_id, type, amount_minor, currency, balance_after_minor, reference_id, metadata)
         VALUES ($1, $2, $3, 'deposit', $4, $5, $6, $7, $8) RETURNING *`,
        [wallet.id, guildId, memberId, amt, cur, newBalance, reference || null, JSON.stringify(metadata)]
      )).rows[0];

      await audit(this.db, ctx, {
        action: 'wallet.deposit',
        domain: 'commerce',
        risk: 'medium',
        metadata: { walletId: wallet.id, amountMinor: amt, currency: cur, reference },
      });

      return {
        walletId: wallet.id,
        balanceMinor: Number(updatedWallet.balance_minor),
        currency: cur,
        transactionId: txRow.id,
        type: 'deposit',
        amountMinor: amt,
      };
    });
  }

  async withdraw({ guildId, memberId, amountMinor, currency = 'USD', destination, metadata = {}, idempotencyKey }, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'high', financial: true });
    const amt = Number(amountMinor);
    if (!amt || amt <= 0) throw new NativeError('invalid_amount', 'Withdrawal amount must be positive');
    const cur = currency.toUpperCase();

    return idempotent(this.db, 'wallet.withdraw', idempotencyKey || `withdraw:${guildId}:${memberId}:${Date.now()}`, { guildId, memberId, amt, cur, destination }, async (c) => {
      const wallet = (await c.query(
        `SELECT * FROM wallets WHERE guild_id = $1 AND member_id = $2 AND currency = $3 FOR UPDATE`,
        [guildId, memberId, cur]
      )).rows[0];

      if (!wallet) throw new NativeError('wallet_not_found', 'Wallet not found');
      const available = Number(wallet.balance_minor) - Number(wallet.locked_minor);
      if (available < amt) throw new NativeError('insufficient_funds', `Insufficient available balance: ${available} < ${amt}`);

      const newBalance = Number(wallet.balance_minor) - amt;
      const updatedWallet = (await c.query(
        `UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [newBalance, wallet.id]
      )).rows[0];

      const txRow = (await c.query(
        `INSERT INTO wallet_transactions (wallet_id, guild_id, member_id, type, amount_minor, currency, balance_after_minor, reference_id, metadata)
         VALUES ($1, $2, $3, 'withdrawal', $4, $5, $6, $7, $8) RETURNING *`,
        [wallet.id, guildId, memberId, -amt, cur, newBalance, destination || null, JSON.stringify(metadata)]
      )).rows[0];

      await audit(this.db, ctx, {
        action: 'wallet.withdraw',
        domain: 'commerce',
        risk: 'high',
        metadata: { walletId: wallet.id, amountMinor: amt, currency: cur, destination },
      });

      return {
        walletId: wallet.id,
        balanceMinor: Number(updatedWallet.balance_minor),
        currency: cur,
        transactionId: txRow.id,
        type: 'withdrawal',
        amountMinor: amt,
      };
    });
  }

  async transfer({ guildId, senderId, recipientId, amountMinor, currency = 'USD', metadata = {}, idempotencyKey }, ctx) {
    authorize(ctx, { domain: 'commerce', risk: 'medium', financial: true });
    if (senderId === recipientId) throw new NativeError('invalid_transfer', 'Cannot transfer to self');
    const amt = Number(amountMinor);
    if (!amt || amt <= 0) throw new NativeError('invalid_amount', 'Transfer amount must be positive');
    const cur = currency.toUpperCase();

    return idempotent(this.db, 'wallet.transfer', idempotencyKey || `transfer:${guildId}:${senderId}:${recipientId}:${Date.now()}`, { guildId, senderId, recipientId, amt, cur }, async (c) => {
      // Lock sender
      const senderWallet = (await c.query(
        `SELECT * FROM wallets WHERE guild_id = $1 AND member_id = $2 AND currency = $3 FOR UPDATE`,
        [guildId, senderId, cur]
      )).rows[0];
      if (!senderWallet) throw new NativeError('insufficient_funds', 'Sender wallet not found');
      const senderAvailable = Number(senderWallet.balance_minor) - Number(senderWallet.locked_minor);
      if (senderAvailable < amt) throw new NativeError('insufficient_funds', `Insufficient available balance: ${senderAvailable} < ${amt}`);

      // Lock recipient
      let recipientWallet = (await c.query(
        `SELECT * FROM wallets WHERE guild_id = $1 AND member_id = $2 AND currency = $3 FOR UPDATE`,
        [guildId, recipientId, cur]
      )).rows[0];
      if (!recipientWallet) {
        recipientWallet = (await c.query(
          `INSERT INTO wallets (guild_id, member_id, currency, balance_minor, locked_minor)
           VALUES ($1, $2, $3, 0, 0) RETURNING *`,
          [guildId, recipientId, cur]
        )).rows[0];
      }

      const senderNewBalance = Number(senderWallet.balance_minor) - amt;
      await c.query(`UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE id = $2`, [senderNewBalance, senderWallet.id]);

      const recipientNewBalance = Number(recipientWallet.balance_minor) + amt;
      await c.query(`UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE id = $2`, [recipientNewBalance, recipientWallet.id]);

      // Record ledger rows
      await c.query(
        `INSERT INTO wallet_transactions (wallet_id, guild_id, member_id, type, amount_minor, currency, balance_after_minor, reference_id, metadata)
         VALUES ($1, $2, $3, 'transfer_out', $4, $5, $6, $7, $8)`,
        [senderWallet.id, guildId, senderId, -amt, cur, senderNewBalance, recipientId, JSON.stringify({ ...metadata, to: recipientId })]
      );

      await c.query(
        `INSERT INTO wallet_transactions (wallet_id, guild_id, member_id, type, amount_minor, currency, balance_after_minor, reference_id, metadata)
         VALUES ($1, $2, $3, 'transfer_in', $4, $5, $6, $7, $8)`,
        [recipientWallet.id, guildId, recipientId, amt, cur, recipientNewBalance, senderId, JSON.stringify({ ...metadata, from: senderId })]
      );

      await audit(this.db, ctx, {
        action: 'wallet.transfer',
        domain: 'commerce',
        risk: 'medium',
        metadata: { from: senderId, to: recipientId, amountMinor: amt, currency: cur },
      });

      return {
        senderBalanceMinor: senderNewBalance,
        recipientBalanceMinor: recipientNewBalance,
        amountMinor: amt,
        currency: cur,
      };
    });
  }

  async history(guildId, memberId, limit = 10) {
    const rows = (await this.db.query(
      `SELECT * FROM wallet_transactions WHERE guild_id = $1 AND member_id = $2 ORDER BY created_at DESC LIMIT $3`,
      [guildId, memberId, limit]
    )).rows;

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      balanceAfterMinor: Number(r.balance_after_minor),
      referenceId: r.reference_id,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
  }
}
