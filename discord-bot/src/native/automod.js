import { authorize, audit } from './core.js';

const PHISHING_REGEX = /(?:discord(?:app)?\.(?:gift|giveaway|nitro|free|claim|airdrop)|discorcl|dlscord|disord|steamcommunityy|steamcomrnunity|roblox-drop|t\.me\/[a-z0-9_]+drop)/i;
const INVITE_REGEX = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]+)/i;

export class AutomodService {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  async getRules(guildId) {
    return (
      await this.db.query(`SELECT * FROM automod_rules WHERE guild_id = $1`, [guildId])
    ).rows;
  }

  async setRule(guildId, ruleType, { enabled = true, action = 'delete_and_warn', threshold = 5 }, ctx) {
    authorize(ctx, { domain: 'moderation', risk: 'medium', permissions: ['ManageGuild'] });

    const row = (
      await this.db.query(
        `INSERT INTO automod_rules (guild_id, rule_type, enabled, action, threshold)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, rule_type) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           action = EXCLUDED.action,
           threshold = EXCLUDED.threshold
         RETURNING *`,
        [guildId, ruleType, enabled, action, threshold]
      )
    ).rows[0];

    await audit(this.db, ctx, {
      action: 'automod.rule_update',
      domain: 'moderation',
      risk: 'medium',
      metadata: { ruleType, enabled, action, threshold },
    });

    return row;
  }

  scanMessage(content) {
    const text = String(content || '');

    // 1. Phishing & Scam Detection
    if (PHISHING_REGEX.test(text)) {
      return {
        flagged: true,
        ruleType: 'anti_phishing',
        reason: 'Detected deceptive phishing/malicious scam link URL.',
        severity: 3,
      };
    }

    // 2. Unauthorized Discord Invites
    if (INVITE_REGEX.test(text)) {
      return {
        flagged: true,
        ruleType: 'anti_invites',
        reason: 'Detected unauthorized Discord server invite link.',
        severity: 2,
      };
    }

    // 3. Mass Mentions
    const userMentions = (text.match(/<@!?(\d+)>/g) || []).length;
    const roleMentions = (text.match(/<@&(\d+)>/g) || []).length;
    const totalMentions = userMentions + roleMentions;
    if (totalMentions >= 5) {
      return {
        flagged: true,
        ruleType: 'mass_mentions',
        reason: `Detected mass mentions (${totalMentions} mentions in a single message).`,
        severity: 2,
      };
    }

    // 4. Mass Caps
    if (text.length > 15) {
      const letters = text.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 10) {
        const uppercase = letters.replace(/[^A-Z]/g, '').length;
        const ratio = uppercase / letters.length;
        if (ratio >= 0.85) {
          return {
            flagged: true,
            ruleType: 'mass_caps',
            reason: `Detected excessive uppercase screaming (${Math.round(ratio * 100)}% caps).`,
            severity: 1,
          };
        }
      }
    }

    return { flagged: false };
  }
}
