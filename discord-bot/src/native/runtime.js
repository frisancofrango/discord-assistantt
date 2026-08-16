import { AnalyticsService } from './analytics.js';
import { TicketService } from './tickets.js';
import { VerificationService } from './verification.js';
import { CommerceService } from './commerce.js';
import { ModerationService } from './moderation.js';
import { MarketingService } from './marketing.js';
import { WalletService } from './wallet.js';
import { RobloxService } from './roblox.js';
import { SettingsService } from './settings.js';
import { CouponService } from './coupons.js';
import { AIStudioService } from './ai-studio.js';
import { BackupService } from './backup.js';
import { LicenseService } from './license.js';
import { SecurityService } from './security.js';
import { AffiliateService } from './affiliate.js';
import { OperatingHoursService } from './schedule.js';
import { LoyaltyService } from './loyalty.js';
import { EscrowService } from './escrow.js';
import { CryptoService } from './crypto.js';

export function createNativeRuntime({ db, queue, tools, config, logger, client, memory, paymentAdapters = {} }) {
  const analytics = new AnalyticsService({ db, retentionDays: config.native?.analyticsRetentionDays ?? 30 });
  const common = { db, queue, tools, analytics };
  const tickets = new TicketService({ ...common, config: config.native?.tickets ?? {} });
  const verification = new VerificationService({ ...common, config: config.native?.verification ?? {} });
  const commerce = new CommerceService({ ...common, paymentAdapters, config: config.native?.commerce ?? {} });
  const moderation = new ModerationService({ ...common, config: config.native?.moderation ?? {} });
  const marketing = new MarketingService({ ...common, config: config.native?.marketing ?? {} });
  const wallet = new WalletService({ db, analytics });
  const roblox = new RobloxService({ db });
  const settings = new SettingsService({ db, logger });
  const coupons = new CouponService({ db, logger });
  const aiStudio = new AIStudioService({ db, memory, settings, logger });
  const backup = new BackupService({ db, logger });
  const license = new LicenseService({ db, logger });
  const security = new SecurityService({ db, logger });
  const affiliate = new AffiliateService({ db, logger });
  const schedule = new OperatingHoursService({ db, logger });
  const loyalty = new LoyaltyService({ db, logger });
  const escrow = new EscrowService({ db, logger });
  const crypto = new CryptoService({ db, logger });
  let worker;

  function start() {
    if (!queue) return Promise.resolve();
    worker = queue.work('native-jobs', async (data, _controls, job) => {
      switch (job.name) {
        case 'ticket.sla': return tickets.handleSla(data.ticketId);
        case 'verification.expire': return verification.expire(data.sessionId);
        case 'moderation.expire': return moderation.expire(data.caseId);
        case 'commerce.release': return commerce.releaseExpiredCarts();
        case 'analytics.aggregate': return analytics.aggregate(data.day);
        case 'analytics.retention': return analytics.enforceRetention();
        case 'marketing.send': return marketing.send(data.campaignId, async (payload) => tools.invoke('direct.message', { userId: payload.memberId, content: payload.template.content }, { client, idempotencyKey: `campaign:${data.campaignId}:${payload.memberId}`, autonomy: 'operator', approval: { status: 'approved' }, consent: true, actor: { authenticated: true, guildMember: true, isOwner: true, permissions: ['SendMessages'] } }));
        default: throw new Error(`Unknown native job ${job.name}`);
      }
    });
    return Promise.all([
      tickets.recoverJobs?.() ?? Promise.resolve(),
      verification.recoverJobs?.() ?? Promise.resolve(),
      moderation.recoverJobs?.() ?? Promise.resolve(),
      marketing.recoverJobs?.() ?? Promise.resolve(),
    ]).catch((e) => logger?.error({ err: e }, 'native job recovery failed'));
  }

  return {
    analytics,
    tickets,
    verification,
    commerce,
    moderation,
    marketing,
    wallet,
    roblox,
    settings,
    coupons,
    aiStudio,
    backup,
    license,
    security,
    affiliate,
    schedule,
    loyalty,
    escrow,
    crypto,
    start,
    close: async () => worker?.close(),
  };
}
