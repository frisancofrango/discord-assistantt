import { Events } from 'discord.js';
import { DiscordEventStore } from './event-store.js';
import { ContextAssembler } from './context.js';
import { EngagementPolicy } from './engagement.js';
import { DiscordToolRegistry } from './tool-runtime.js';
import { registerDiscordTools } from './tool-definitions.js';
import { withCorrelation, correlationId } from '../foundation/logger.js';
import { buildProposal, hashApprovalToken } from '../autonomy/proposal.js';
import { proposalPanel, progressPanel, receiptPanel } from '../autonomy/ui.js';

const observed = [Events.MessageCreate, Events.MessageUpdate, Events.MessageDelete, Events.MessageReactionAdd, Events.MessageReactionRemove, Events.InteractionCreate, Events.GuildMemberAdd, Events.GuildMemberUpdate, Events.GuildMemberRemove, Events.GuildRoleCreate, Events.GuildRoleUpdate, Events.GuildRoleDelete, Events.ChannelCreate, Events.ChannelUpdate, Events.ChannelDelete, Events.ThreadCreate, Events.ThreadUpdate, Events.ThreadDelete, Events.GuildBanAdd, Events.GuildBanRemove, Events.AutoModerationActionExecution, Events.AutoModerationRuleCreate, Events.AutoModerationRuleUpdate, Events.AutoModerationRuleDelete, Events.GuildUpdate, Events.InviteCreate, Events.InviteDelete, Events.GuildScheduledEventCreate, Events.GuildScheduledEventUpdate, Events.GuildScheduledEventDelete, Events.WebhooksUpdate];

const serverOpIntent = /\b(organi[sz]e|organi[sz]ation|restructure|set ?up|setup|rearrange|structure|cleanup|clean ?up|overhaul|build|design|moderate|automate|manage)\b/i;
const serverDomain = /\b(server|channel|categor|role|member|permission|entire|everything|whole|all|this)\b/i;
const approvePhrase = /^(approved|approve|do it|do everything|do it all|go|go ahead|go for it|yes|confirm|just do it|yeah|yep|sounds good|approved do|approved, do)/i;
const rejectPhrase = /^(no|reject|deny|cancel|stop|don'?t|not that|wait|hold on)/i;
const aliasRe = /(?:(?:you can |please )?call me(?: by (?:my )?(?:nick(?:name)?|name))?|my (?:nick)?name(?:'s| is))\s+["'`]?([A-Za-z0-9_ -]{2,24}?)["'`]?(?:\s*(?:please|now|from now on))?[\s!.']*$/i;

const handledIds = new Map();
const sentReplies = new Map();
const botMessages = new Map();
const deletedSassAt = new Map();
const autoReplyAt = new Map();
const ackEmoji = '👀';

const deletedSassLines = [
  "rude. i typed that with my tiny robot hands.",
  "poof. and just like that, it never happened.",
  "okay. not a single word from me either.",
  "deleted? i'll pretend i didn't see that.",
  "guess that message is living in the void now.",
];

// Zero-model instant handling for trivial traffic: greeting text or a single
// reaction instead of a 15-30s farm round-trip.
const instantRules = [
  { re: /^(hello|hi|hey|yo|sup|wassup|hola|heya|ello|good morning|good night)\b[!. ]*$/i, react: null, reply: (n) => `hey ${n} 👋` },
  { re: /^(ok|okay|kkk?|alright+|aight+|bet|cool|nice|good|lol|lmfao?|haha+|rip|gg)\b[!. ]*$/i, react: '👍' },
  { re: /^(bruh|jfc|wtf|wth|omg|ugh|damn|oof|yikes|ouch)\b[!. ]*$/i, react: '😅' },
  { re: /^(what|huh|uh|wut)\??[!. ]*$/i, react: '🤔' },
];

function splitParts(text) {
  const segments = String(text ?? '').split(/\[PART\s*\d+\]\s*/);
  const parts = [];
  for (const seg of segments) if (seg.trim()) parts.push(seg.trim().slice(0, 2000));
  if (!parts.length) parts.push('...');
  return parts;
}

export function createDiscordRuntime({ client, runtime, config, logger, memory = null }) {
  const store = new DiscordEventStore(runtime.db);
  const context = new ContextAssembler({
    db: runtime.db,
    maxTokens: config.discord.contextTokens,
    recentLimit: config.discord.contextMessages,
    semanticSearch: async ({ guildId, userId, query, limit }) => memory?.enabled ? memory.search({ query, guildId, userId, limit }) : [],
  });
  const engagement = new EngagementPolicy({
    cooldownMs: config.discord.engagementCooldownMs,
    passiveThreshold: config.discord.passiveThreshold,
  });
  const tools = registerDiscordTools(new DiscordToolRegistry({ repositories: runtime.repositories, db: runtime.db, logger }));
  const listeners = [];

  const rememberExchange = (userId, guildId, content, channelId) => {
    if (memory?.enabled && config.memory.ingestion) {
      memory.remember({ guildId: guildId ?? null, userId, kind: 'exchange', content, metadata: { discordChannelId: channelId } })
        .then((r) => logger.debug?.({ stored: r.stored }, 'semantic exchange remembered'))
        .catch((err) => logger.error?.({ err }, 'semantic memory ingestion failed'));
    }
  };

  const scopeOf = (message) => `${message.guildId ?? 'dm'}:${message.channel?.isThread?.() ? message.channel.parentId : message.channelId}`;

  const sendTyping = async (message) => { try { await message.channel.sendTyping(); } catch { /* noop */ } };

  const ackWithReaction = async (message) => {
    try { await message.react(ackEmoji); return true; } catch { return false; }
  };
  const clearAckReaction = async (message) => {
    try {
      const reaction = message.reactions.cache.get(ackEmoji);
      if (reaction) await reaction.users.remove(client.user.id);
    } catch { /* noop */ }
  };

  const sendReply = async ({ message, raw, scopeKey }) => {
    const parts = splitParts(raw);
    const channel = message.channel;
    const first = await message.reply({ content: parts[0], allowedMentions: { parse: [], repliedUser: false } });
    let lastId = first.id;
    botMessages.set(first.id, { channelId: channel.id, at: Date.now() });
    sentReplies.set(message.id, { botMessageId: first.id, channelId: channel.id, at: Date.now() });
    for (let i = 1; i < parts.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const extra = await channel.send({ content: parts[i], allowedMentions: { parse: [] } });
      lastId = extra.id;
      botMessages.set(extra.id, { channelId: channel.id, at: Date.now() });
    }
    engagement.recordResponse(scopeKey, lastId);
    rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nAzure: ${String(raw).slice(0, 1500)}`, message.channelId);
    if (Date.now() - (sentReplies.get(message.id)?.at ?? 0) > 10 * 60 * 60 * 1000) sentReplies.delete(message.id);
    return first;
  };

  async function maybeRunServerTask(message) {
    if (!message.guildId || message.guild?.ownerId !== message.author?.id) return null;
    if (!serverOpIntent.test(message.content) || !serverDomain.test(message.content)) return null;
    if (!runtime.agent?.planner || !runtime.autonomy) return null;
    const botId = client.user.id;
    try {
      const guild = (await runtime.db.query(`INSERT INTO guilds(discord_id,name) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET name=excluded.name RETURNING *`, [message.guildId, message.guild?.name ?? null])).rows[0];
      const user = (await runtime.db.query(`INSERT INTO users(discord_id,username) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username RETURNING *`, [message.author.id, message.author.username])).rows[0];
      const snapshotReceipt = await tools.invoke('guild.snapshot', { guildId: message.guildId }, { client, db: runtime.db, idempotencyKey: `chat-task:${message.id}:snapshot`, autonomy: 'advisor', actor: { authenticated: true, guildMember: true, isOwner: true, permissions: [] }, correlationId: correlationId() });
      const before = snapshotReceipt.output.snapshot;
      logger.info({ guildId: message.guildId }, 'owner chat task: snapshot captured, planning');
      const { task, plan } = await runtime.agent.planner.create({ goal: message.content, context: { observedAt: before.capturedAt, guildSnapshot: before }, guildId: guild.id, actorId: user.id, idempotencyKey: `chat-task:${message.id}` });
      const draft = buildProposal({ task, plan, beforeSnapshot: before, tierCount: runtime.autonomy.config.tierCount });
      draft.beforeSnapshot = before;
      const row = await runtime.autonomy.store.createProposal(draft);
      const proposal = runtime.autonomy.hydrate(row);
      proposal.beforeSnapshot = before;
      const grant = await runtime.autonomy.approvals.issue({ proposal, actorId: message.author.id });
      const panel = await message.reply({ ...proposalPanel(proposal, grant.token), allowedMentions: { parse: [] } });
      await runtime.autonomy.store.updateProposal(row.id, { discord_message_id: panel.id });
      return { task, plan };
    } catch (err) {
      logger.warn({ err, content: message.content }, 'chat task handoff failed; falling back to chat');
      return null;
    }
  }

  async function findPanelToken(message) {
    try {
      const panel = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      if (panel?.author?.id !== client.user.id) return null;
      for (const row of panel.components ?? []) for (const part of row.components ?? []) {
        const id = part.customId ?? part.data?.customId;
        if (typeof id === 'string' && id.startsWith('azp:all:')) return id.split(':')[2];
      }
      return null;
    } catch { return null; }
  }

  async function maybeRunChatApproval(message, isEdit) {
    if (isEdit || !message.guildId || message.guild?.ownerId !== message.author?.id || !runtime.autonomy) return null;
    const content = message.content.trim();
    let decisionName = null;
    if (approvePhrase.test(content) || (!rejectPhrase.test(content) && /^approved/.test(content.toLowerCase()))) decisionName = 'approve_all';
    else if (rejectPhrase.test(content)) decisionName = 'reject';
    if (!decisionName) return null;
    let token = null;
    try {
      if (message.reference?.messageId) token = await findPanelToken(message);
      if (!token) {
        const row = (await runtime.db.query(`SELECT id FROM proposals WHERE guild_discord_id=$1 AND status='pending' AND discord_message_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [message.guildId])).rows[0];
        if (!row) return null;
        const panel = await message.channel.messages.fetch(row.discord_message_id).catch(() => null);
        if (!panel) return null;
        for (const r of panel.components ?? []) for (const part of r.components ?? []) {
          const id = part.customId ?? part.data?.customId;
          if (typeof id === 'string' && id.startsWith('azp:all:')) { token = id.split(':')[2]; break; }
        }
        if (!token) return null;
      }
      const autonomy = runtime.autonomy;
      const grant = await autonomy.store.findApprovalToken(hashApprovalToken(token, autonomy.config.approvalTokenPepper));
      if (!grant) return null;
      const proposal = autonomy.hydrate(await autonomy.store.getProposal(grant.proposal_id));
      if (proposal.status !== 'pending') return null;
      const actor = { id: message.author.id, guildId: message.guildId, authenticated: true, bot: false, isOwner: true, permissions: message.memberPermissions?.toArray?.() ?? [] };
      const safe = proposal.machinePlan.steps.filter((s) => !s.irreversible && s.risk !== 'high').map((s) => s.id);
      const decision = await autonomy.approvals.decide({ token, proposal, actor, decision: decisionName, selectedStepIds: safe, policy: { default: { autonomy: 'operator' } }, budget: { limit: runtime.agent.router?.budgetUsd ?? 5, spent: 0 } });
      if (!decisionName.startsWith('approve')) return { status: 'noop' };
      await message.channel.sendTyping();
      await message.reply({ ...progressPanel({ goal: proposal.goal, status: 'running', stage: 'preflight', completed: 0, total: decision.approved_step_ids?.length ?? decision.approvedStepIds.length }), allowedMentions: { parse: [] } });
      const result = await autonomy.executor.start({ proposal, decision, actor });
      await message.reply({ ...receiptPanel(result.receipt), allowedMentions: { parse: [] } });
      return { status: 'done' };
    } catch (err) {
      logger.warn({ err, content }, 'chat approval failed');
      return null;
    }
  }

  async function assembleContext(message) {
    const assembled = await context.assemble({
      messageId: message.id,
      guildId: message.guildId,
      channelId: message.channel?.isThread?.() ? message.channel.parentId : message.channelId,
      threadId: message.channel?.isThread?.() ? message.channelId : null,
      userId: message.author.id,
    });
    assembled.authorName = message.member?.displayName ?? message.author.username;
    return assembled;
  }

  // Unified single-call turn for messages that did not explicitly engage Azure.
  // The model itself decides whether a reply is warranted, so we avoid a slow
  // serial classifier + answer double round-trip.
  async function maybeAutoReply(message, decision) {
    const scopeKey = decision.scopeKey;
    const now = Date.now();
    const lastAuto = autoReplyAt.get(scopeKey) ?? 0;
    if (now - lastAuto < 8_000) return null;
    autoReplyAt.set(scopeKey, now);
    if (!runtime.agent?.converse) return null;
    const assembled = await assembleContext(message);
    const response = await runtime.agent.converse({ message, context: assembled, decision: { ...decision, reason: 'auto_decision' }, mode: 'decide' });
    if (!response || response.includes('##NO_REPLY##')) return null;
    await sendReply({ message, raw: response, scopeKey });
    return true;
  }

  async function routeMessage(message, isEdit) {
    if (message.partial) await message.fetch().catch(() => null);
    const dedupeNow = Date.now();
    for (const [id, t] of handledIds) if (dedupeNow - t > 120_000) handledIds.delete(id);
    if (handledIds.has(message.id)) return;
    handledIds.set(message.id, dedupeNow);
    if (sentReplies.size > 500 || botMessages.size > 500) {
      const cutoff = dedupeNow - 6 * 3600 * 1000;
      for (const [id, e] of sentReplies) if (e.at < cutoff) sentReplies.delete(id);
      for (const [id, e] of botMessages) if (e.at < cutoff) botMessages.delete(id);
    }

    if (isEdit && !message.editedTimestamp) return;

    const aliasMatch = message.content.trim().match(aliasRe);
    if (aliasMatch && message.guildId && !isEdit && !message.author?.bot && message.content.trim().length <= 80) {
      try {
        const alias = aliasMatch[1].trim().replace(/\s+/g, ' ');
        await runtime.db.query(`INSERT INTO user_aliases(discord_id,alias) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET alias=excluded.alias,updated_at=now()`, [message.author.id, alias]);
        await message.reply({ content: `Got it — I\u2019ll call you ${alias} from now on.`, allowedMentions: { parse: [] } }).catch(() => {});
        logger.info({ alias, userId: message.author.id }, 'user alias captured');
      } catch (err) { logger.warn({ err }, 'alias capture failed'); }
      return;
    }

    const botId = client.user.id;

    const instantScope = scopeOf(message);
    const instant = instantRules.find((r) => !isEdit && !message.author?.bot && message.content.trim().length <= 14 && r.re.test(message.content.trim()));
    if (instant) {
      if (instant.react) { try { await message.react(instant.react); } catch { /* noop */ } }
      if (instant.reply) {
        const displayName = message.member?.displayName ?? message.author.username;
        await message.reply({ content: instant.reply(displayName), allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
      }
      engagement.recordResponse(instantScope, message.id);
      return;
    }

    const decision = engagement.decide({
      authorBot: message.author?.bot,
      webhookId: message.webhookId,
      selfAuthored: message.author?.id === botId,
      isDM: !message.guildId,
      mentionsAzure: message.mentions?.users?.has(botId),
      repliesToAzure: message.reference?.messageId ? await message.channel.messages.fetch(message.reference.messageId).then((m) => m.author.id === botId).catch(() => false) : false,
      activeTask: false,
      ownerCommand: message.guild?.ownerId === message.author?.id && /^azure[,!:\s]/i.test(message.content),
      channelId: message.channelId,
      threadId: message.channel?.isThread?.() ? message.channelId : null,
      userId: message.author?.id,
      content: message.content,
      question: /\?\s*$/.test(message.content),
      azureRelevant: /\bazure\b/i.test(message.content),
      recentAzureContext: false,
      lowSignal: message.content.trim().length < 3,
      isEdit,
      materialEdit: isEdit && Boolean(message.editedTimestamp),
    });

    // Smart edit: if we already answered this exact message and our reply is
    // still the last message in the channel, EDIT the reply in place instead
    // of posting a fresh one (keeps the conversation slot clean).
    if (isEdit && message.editedTimestamp) {
      const prior = sentReplies.get(message.id);
      if (prior) {
        const last = await message.channel.messages.fetch({ limit: 1 }).then((ms) => ms.first()).catch(() => null);
        if (last?.id === prior.botMessageId && Date.now() - prior.at < 30 * 60 * 1000 && runtime.agent?.converse) {
          try {
            const assembled = await assembleContext(message);
            const response = await runtime.agent.converse({ message, context: assembled, decision: { ...decision, reason: 'message_edit' }, mode: 'engaged' });
            if (response && !response.includes('##NO_REPLY##')) {
              const target = await message.channel.messages.fetch(prior.botMessageId).catch(() => null);
              if (target) {
                await target.edit({ content: splitParts(response)[0], allowedMentions: { parse: [], repliedUser: false } });
                sentReplies.set(message.id, { ...prior, at: Date.now() });
                rememberExchange(message.author.id, message.guildId, `User edited to: ${message.content}\nAzure: ${splitParts(response)[0].slice(0, 1200)}`, message.channelId);
                logger.info({ messageId: message.id }, 'reply edited in place after user edit');
              }
            }
          } catch (err) { logger.warn({ err }, 'in-place reply edit failed'); }
          return;
        }
      }
    }

    let active = decision;
    if (!active.engage && !isEdit && !message.author?.bot && message.guildId && message.content.trim().length >= 3) {
      const approved = await maybeRunChatApproval(message, isEdit);
      if (approved) {
        engagement.recordResponse(active.scopeKey, message.id);
        rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nAzure: executed a chat-approved server proposal`, message.channelId);
        return;
      }
      if (await maybeAutoReply(message, decision)) return;
    }
    if (!active.engage) return;

    await sendTyping(message);
    const acked = !isEdit ? await ackWithReaction(message) : false;
    if (!isEdit && message.guild?.ownerId === message.author?.id) {
      const approved = await maybeRunChatApproval(message, isEdit);
      if (approved) {
        if (acked) await clearAckReaction(message);
        engagement.recordResponse(active.scopeKey, message.id);
        rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nAzure: executed a chat-approved server proposal`, message.channelId);
        return;
      }
      const handled = await maybeRunServerTask(message);
      if (handled) {
        if (acked) await clearAckReaction(message);
        engagement.recordResponse(active.scopeKey, message.id);
        rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nAzure: submitted a server organization proposal for approval`, message.channelId);
        return;
      }
    }

    const assembled = await assembleContext(message);
    if (!runtime.agent?.converse) return;
    const response = await runtime.agent.converse({ message, context: assembled, decision: active, mode: 'engaged' });
    if (acked) await clearAckReaction(message);
    if (!response || response.includes('##NO_REPLY##')) return;
    await sendReply({ message, raw: response, scopeKey: active.scopeKey });
  }

  async function handleMessageDelete(deleted) {
    const deletedId = deleted.id;
    const prior = sentReplies.get(deletedId);
    if (prior) {
      // The user deleted a message we answered. If our reply is still the last
      // message in the channel and recent, remove the now-orphaned reply.
      try {
        const last = await deleted.channel.messages.fetch({ limit: 1 }).then((ms) => ms.first()).catch(() => null);
        if (last?.id === prior.botMessageId && Date.now() - prior.at < 30 * 60 * 1000) {
          await deleted.channel.messages.delete(prior.botMessageId).catch(() => {});
          logger.info({ messageId: deletedId }, 'orphaned reply removed after user deleted their message');
        }
      } catch (err) { logger.warn({ err }, 'orphaned reply cleanup failed'); }
      sentReplies.delete(deletedId);
      return;
    }
    if (botMessages.has(deletedId)) {
      // Someone deleted one of Azure's messages — react playfully, once per
      // channel and only if it was recent, so it never becomes noise.
      const entry = botMessages.get(deletedId);
      botMessages.delete(deletedId);
      if (Date.now() - entry.at > 10 * 60 * 1000) return;
      const channel = deleted.channel?.id ? deleted.channel : null;
      const key = channel?.id ?? deleted.channelId ?? 'dm';
      const lastSass = deletedSassAt.get(key) ?? 0;
      if (Date.now() - lastSass < 5 * 60 * 1000) return;
      deletedSassAt.set(key, Date.now());
      setTimeout(async () => {
        try {
          const last = await channel?.messages.fetch({ limit: 1 }).then((ms) => ms.first()).catch(() => null);
          if (last?.id === deletedId || !last || last.author?.id !== client.user.id) return;
          const line = deletedSassLines[Math.floor(Math.random() * deletedSassLines.length)];
          await channel.send({ content: line, allowedMentions: { parse: [] } });
        } catch { /* noop */ }
      }, 1500);
    }
  }

  for (const eventName of observed) {
    const listener = (...args) => withCorrelation(null, async () => {
      try {
        const entity = eventName === Events.MessageUpdate ? args[1] : args[0];
        const extra = eventName.includes('Reaction')
          ? { reaction: args[0]?.emoji?.identifier, userId: args[1]?.id, resourceId: args[0]?.message?.id, guildId: args[0]?.message?.guildId, channelId: args[0]?.message?.channelId }
          : {};
        await store.ingest(eventName, entity, extra);
        if (eventName === Events.MessageCreate || eventName === Events.MessageUpdate) await routeMessage(entity, eventName === Events.MessageUpdate);
        else if (eventName === Events.MessageDelete) await handleMessageDelete(entity);
      } catch (err) { logger.error({ err, eventName }, 'Discord event ingestion failed'); }
    });
    client.on(eventName, listener);
    listeners.push([eventName, listener]);
  }

  return { store, context, engagement, tools, close: async () => { for (const [n, l] of listeners) client.off(n, l); } };
}
