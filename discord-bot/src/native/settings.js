import { authorize, NativeError, audit } from './core.js';

export const DEFAULT_SETTINGS = {
  antiRaidLevel: 'standard', // relaxed, standard, fortress, lockdown
  verificationMode: 'math_captcha', // math_captcha, button, oauth2, manual
  aiPersona: 'concierge', // concierge, sales_closer, security_warden, custom
  aiAutonomy: 'operator', // advisor, operator, autopilot
  defaultCurrency: 'USD',
  couponsEnabled: true,
  cashbackPercent: 0,
  logChannelId: null,
  ticketCategoryId: null,
};

export class SettingsService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
    this.cache = new Map();
  }

  async getSettings(guildId) {
    if (this.cache.has(guildId)) {
      return this.cache.get(guildId);
    }

    const row = (await this.db.query(`SELECT * FROM guild_settings WHERE guild_id = $1`, [guildId])).rows[0];

    const settings = row
      ? {
          guildId: row.guild_id,
          antiRaidLevel: row.anti_raid_level,
          verificationMode: row.verification_mode,
          aiPersona: row.ai_persona,
          aiAutonomy: row.ai_autonomy,
          defaultCurrency: row.default_currency,
          couponsEnabled: row.coupons_enabled,
          cashbackPercent: row.cashback_percent,
          logChannelId: row.log_channel_id,
          ticketCategoryId: row.ticket_category_id,
          metadata: row.metadata || {},
          updatedAt: row.updated_at,
        }
      : {
          guildId,
          ...DEFAULT_SETTINGS,
          metadata: {},
          updatedAt: new Date(),
        };

    this.cache.set(guildId, settings);
    return settings;
  }

  async updateSettings(guildId, updates = {}, ctx) {
    authorize(ctx, { domain: 'server_design', risk: 'high', permissions: ['ManageGuild'] });

    const current = await this.getSettings(guildId);
    const merged = { ...current, ...updates };

    const validAntiRaid = ['relaxed', 'standard', 'fortress', 'lockdown'];
    if (updates.antiRaidLevel && !validAntiRaid.includes(updates.antiRaidLevel)) {
      throw new NativeError('invalid_setting', `Invalid anti-raid level: ${updates.antiRaidLevel}`);
    }

    const validVerification = ['math_captcha', 'button', 'oauth2', 'manual'];
    if (updates.verificationMode && !validVerification.includes(updates.verificationMode)) {
      throw new NativeError('invalid_setting', `Invalid verification mode: ${updates.verificationMode}`);
    }

    const validPersonas = ['concierge', 'sales_closer', 'security_warden', 'custom'];
    if (updates.aiPersona && !validPersonas.includes(updates.aiPersona)) {
      throw new NativeError('invalid_setting', `Invalid AI persona: ${updates.aiPersona}`);
    }

    const row = (
      await this.db.query(
        `INSERT INTO guild_settings (
          guild_id, anti_raid_level, verification_mode, ai_persona, ai_autonomy,
          default_currency, coupons_enabled, cashback_percent, log_channel_id, ticket_category_id, metadata, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
        ON CONFLICT (guild_id) DO UPDATE SET
          anti_raid_level = EXCLUDED.anti_raid_level,
          verification_mode = EXCLUDED.verification_mode,
          ai_persona = EXCLUDED.ai_persona,
          ai_autonomy = EXCLUDED.ai_autonomy,
          default_currency = EXCLUDED.default_currency,
          coupons_enabled = EXCLUDED.coupons_enabled,
          cashback_percent = EXCLUDED.cashback_percent,
          log_channel_id = EXCLUDED.log_channel_id,
          ticket_category_id = EXCLUDED.ticket_category_id,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        RETURNING *`,
        [
          guildId,
          merged.antiRaidLevel,
          merged.verificationMode,
          merged.aiPersona,
          merged.aiAutonomy,
          merged.defaultCurrency,
          merged.couponsEnabled,
          merged.cashbackPercent,
          merged.logChannelId,
          merged.ticketCategoryId,
          JSON.stringify(merged.metadata || {}),
        ]
      )
    ).rows[0];

    const result = {
      guildId: row.guild_id,
      antiRaidLevel: row.anti_raid_level,
      verificationMode: row.verification_mode,
      aiPersona: row.ai_persona,
      aiAutonomy: row.ai_autonomy,
      defaultCurrency: row.default_currency,
      couponsEnabled: row.coupons_enabled,
      cashbackPercent: row.cashback_percent,
      logChannelId: row.log_channel_id,
      ticketCategoryId: row.ticket_category_id,
      metadata: row.metadata || {},
      updatedAt: row.updated_at,
    };

    this.cache.set(guildId, result);

    await audit(this.db, ctx, {
      action: 'settings.update',
      domain: 'server_design',
      risk: 'high',
      metadata: updates,
    });

    return result;
  }
}
