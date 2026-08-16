import { Events } from 'discord.js';
import { DiscordEventStore } from './event-store.js';
import { ContextAssembler } from './context.js';
import { EngagementPolicy } from './engagement.js';
import { DiscordToolRegistry } from './tool-runtime.js';
import { registerDiscordTools } from './tool-definitions.js';
import { withCorrelation, correlationId } from '../foundation/logger.js';
import { sanitizeReply } from '../lib/sanitize.js';
import { buildProposal, hashApprovalToken } from '../autonomy/proposal.js';
import { proposalPanel, progressPanel, receiptPanel } from '../autonomy/ui.js';
import { panel, notice, V2 } from '../ui/theme.js';

const observed = [Events.MessageCreate, Events.MessageUpdate, Events.MessageDelete, Events.MessageReactionAdd, Events.MessageReactionRemove, Events.InteractionCreate, Events.GuildMemberAdd, Events.GuildMemberUpdate, Events.GuildMemberRemove, Events.GuildRoleCreate, Events.GuildRoleUpdate, Events.GuildRoleDelete, Events.ChannelCreate, Events.ChannelUpdate, Events.ChannelDelete, Events.ThreadCreate, Events.ThreadUpdate, Events.ThreadDelete, Events.GuildBanAdd, Events.GuildBanRemove, Events.AutoModerationActionExecution, Events.AutoModerationRuleCreate, Events.AutoModerationRuleUpdate, Events.AutoModerationRuleDelete, Events.GuildUpdate, Events.InviteCreate, Events.InviteDelete, Events.GuildScheduledEventCreate, Events.GuildScheduledEventUpdate, Events.GuildScheduledEventDelete, Events.WebhooksUpdate];

const serverOpIntent = /\b(organi[sz]e|organi[sz]ation|restructure|set ?up|setup|rearrange|structure|cleanup|clean ?up|overhaul|rebuild|redesign|rework|reorgani[sz]e|moderate|automate|manage|market|promote|advertise|research|rebrand|fix|improve|expand|grow|launch|revamp|upgrade|add|create|make|build|write|post|pin|update|rename|change|edit|delete|remove|merge|split|move)\b/i;
const serverDomain = /\b(server|channel|categor|role|member|permission|shop|listing|button|dropdown|embed|message|post|emoji|sticker|rule|welcome|announcement|template|section|entire|everything|whole|all|this)\b/i;
const approvePhrase = /^(approved|approve|do it|do everything|do it all|go|go ahead|go for it|yes|confirm|just do it|yeah|yep|sounds good|approved do|approved, do)/i;
const rejectPhrase = /^(no|reject|deny|cancel|stop|don'?t|not that|wait|hold on)/i;
const aliasRe = /(?:(?:you can |please )?call me(?: by (?:my )?(?:nick(?:name)?|name))?|my (?:nick)?name(?:'s| is))\s+["'`]?([A-Za-z0-9_ -]{2,24}?)["'`]?(?:\s*(?:please|now|from now on))?[\s!.']*$/i;

const handledIds = new Map();
const sentReplies = new Map();
const botMessages = new Map();
const deletedSassAt = new Map();
const autoReplyAt = new Map();
const scopeBusy = new Map();
const pendingScopes = new Map();
const ghostEditAt = new Map();
const inFlightTurns = new Set();
const firstSeenAt = new Map();
const taskAttempted = new Map();
const ownerCache = new Map();

const deletedSassLines = [
  "rude. i typed that with my tiny robot hands.",
  "poof. and just like that, it never happened.",
  "okay. not a single word from me either.",
  "deleted? i'll pretend i didn't see that.",
  "guess that message is living in the void now.",
];

// Zero-model instant handling for trivial traffic: greeting text or a single
// reaction instead of a 15-30s farm round-trip.
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const instantRules = [
  { re: /^(hello|hi|hey|yo|sup|wassup|hola|heya|ello|good morning|good night)\b[!. ]*$/i, react: null, reply: (n) => `hey ${n} 👋` },
  { re: /^(oi|ola|olá|opa|eai|e aí|fala|salve|bom dia|boa tarde|boa noite)\b[!. ]*$/i, react: null, reply: (n) => `opa ${n} 👋` },
  { re: /^(tudo bem|como vai|beleza|suave|tranquilo|td bem)\??[!. ]*$/i, react: null, reply: () => pick([`tudo suave por aqui, e com você? 😎`, `tranquilo demais. precisando de algo?`, `tudo certo, na atividade!`, `tranquilão, só na paz. e aí?`]) },
  { re: /^(valeu|vlw|obrigado|obg|agradece|tmj|tamo junto)\b[!. ]*$/i, react: '💚' },
  { re: /^(quanto custa|qual o valor|preco|preço|catalogo|catálogo|loja)\b[!. ]*$/i, react: null, reply: () => `dá uma olhada no catálogo oficial usando \`/sales loja\` ou \`/product listar\` 🛍️` },
  { re: /^(como comprar|como pagar|pix|forma de pagamento)\b[!. ]*$/i, react: null, reply: () => `você pode abrir um carrinho direto com \`/cart\` ou pagar via PIX instantâneo 🇧🇷` },
  { re: /^(?:how(?:'?s| is| are| r)(?: u| you| ya| it)(?: doin| doing| going)?|how (?:u|you|ya|it)(?: doin| doing| going)?|hows (?:it|life)(?: going)?)\b[!. ]*$/i, react: null, reply: () => pick([`doin good, just vibing. you? 😎`, `hangin in there, you?`, `chillin, what's up?`, `busy bein awesome. how bout you?`]) },
  { re: /^(?:that'?s|that) (?:good|great|awesome|sweet|perfect|nice|cool|dope|fire|lit)\b[!. ]*$/i, react: null, reply: () => pick([`glad to hear it 😎`, `nice, good stuff`, `told you it would be`, `as expected of you`]) },
  { re: /^(?:nice|cool|sweet|awesome|dope|fire|lit|bet|fr|facts|valid)\b[!. ]*$/i, react: '😎' },
  { re: /^(?:lol|lmao|lmfao|rofl|haha|hehe)\b[!. ]*$/i, react: '😂' },
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

// Model-driven [PART n] is unreliable, so also split long answers in code:
// anything over ~1250 chars becomes several messages by sentence boundaries.
function splitLong(text) {
  const segments = String(text ?? '').split(/\[PART\s*\d+\]\s*/);
  let parts = segments.map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1 && parts[0].length > 1250) {
    const out = [];
    let buf = '';
    for (const sentence of parts[0].match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) ?? [parts[0]]) {
      if (buf && (buf + sentence).length > 1250) { out.push(buf.trim()); buf = sentence; }
      else buf += sentence;
    }
    if (buf.trim()) out.push(buf.trim());
    parts = out;
  }
  return parts.map((p) => p.slice(0, 2000));
}

// Turn "#name" mentions into real clickable channel mentions using the live
// id map from guildInventory (skips already-rendered <#id> mentions).
function clickableChannels(text, idMap) {
  if (!idMap || typeof idMap !== 'object') return text;
  return String(text).replace(/(^|\s)#([A-Za-z0-9-_]{1,32})(?=[\s,.!?;:)\]]|$)/g, (m, pre, name) => (idMap[name] ? `${pre}<#${idMap[name]}>` : m));
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
      memory.rememberState({ guildId: guildId ?? null, userId, channelId, line: String(content).replace(/\s+/g, ' ').slice(0, 300) })
        .then((r) => logger.debug?.({ lines: r.lines }, 'channel state digest updated'))
        .catch((err) => logger.error?.({ err }, 'channel state digest failed'));
    }
  };

  const scopeOf = (message) => `${message.guildId ?? 'dm'}:${message.channel?.isThread?.() ? message.channel.parentId : message.channelId}`;

  // Owner check that survives a cold guild cache (message.guild?.ownerId is
  // undefined when the guild was never fetched) — otherwise an owner command
  // falls through to a chat reply asking questions instead of acting.
  const isServerOwner = async (message) => {
    if (!message.guildId || message.author?.bot) return false;
    const cached = ownerCache.get(message.guildId);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.id === message.author.id;
    let ownerId = message.guild?.ownerId ?? null;
    if (!ownerId) {
      try {
        const guild = message.guild ?? (await client.guilds.fetch(message.guildId).catch(() => null));
        ownerId = guild ? (await guild.fetchOwner().then((m) => m.id).catch(() => null)) : null;
      } catch { ownerId = null; }
    }
    ownerCache.set(message.guildId, { id: ownerId, at: Date.now() });
    return ownerId === message.author.id;
  };

  const sendTyping = async (message) => { try { await message.channel.sendTyping(); } catch { /* noop */ } };

  // Keeps the "Loop is typing..." bubble alive (Discord typing expires after
  // ~10s) for the whole duration of a model turn.
  const withTyping = async (message, work) => {
    await sendTyping(message);
    const arm = setInterval(() => sendTyping(message).catch(() => {}), 9_000);
    arm.unref?.();
    try { return await work(); } finally { clearInterval(arm); }
  };

  // Control markers may arrive in imperfect form (single '#', missing second
  // marker, etc.) — normalize them before anything can leak into chat.
  const stripNoReply = (t) => String(t ?? '').replace(/#+\s*no[_ -]?reply\s*#*/gi, '').trim();

  // ##REACT:emoji## — tolerate a missing closing '##' when the marker sits at
  // the end of the text (the model often drops it), still never match mid-line.
  const reactMarker = /##REACT:\s*([^#\n]{1,40})\s*#*(?=\s*(?:\n|$))/;
  const stripReact = (t) => String(t ?? '').replace(/##REACT:\s*[^#\n]{1,40}\s*#*(?=\s*(?:\n|$))/g, '').replace(/##REACT:[ \t]*#*(?=\s*(?:\n|$))/g, '');

  const maybeGhostEdit = async (message, raw) => {
    if (!raw.startsWith('##GHOSTEDIT##')) return false;
    const reactMatch = String(raw ?? '').match(reactMarker);
    if (reactMatch) await message.react(reactMatch[1].trim()).catch(() => {});
    const scope = scopeOf(message);
    const last = ghostEditAt.get(scope) ?? 0;
    if (Date.now() - last < 4 * 60 * 1000) return false;
    const content = raw.replace(/^##GHOSTEDIT##\s*/i, '').replace(reactMatch ? reactMatch[0] : '', '').slice(0, 2000);
    try {
      const recent = await message.channel.messages.fetch({ limit: 6 });
      const ours = [...recent.values()].find((m) => m.author?.id === client.user.id);
      if (!ours) return false;
      await ours.edit({ content, allowedMentions: { parse: [] } });
      ghostEditAt.set(scope, Date.now());
      logger.info({ channelId: message.channelId }, 'ghost edit applied');
      return true;
    } catch (err) { logger.warn({ err }, 'ghost edit failed'); return false; }
  };

  // Posting a Discord "reply" to a message that was deleted mid-turn throws
  // MESSAGE_REFERENCE_UNKNOWN_MESSAGE — fall back to a plain channel send so
  // the answer still lands (and never crashes the turn).
  const replyOrSend = async (channel, message, content) => {
    try { return await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } }); }
    catch (err) { logger.warn?.({ err }, 'reply target gone; falling back to plain send'); return channel.send({ content, allowedMentions: { parse: [] } }); }
  };

  const sendReply = async ({ message, raw, scopeKey }) => {
    const reactMatch = String(raw ?? '').match(reactMarker);
    const reactEmoji = reactMatch?.[1]?.trim() ?? null;
    const cleaned = sanitizeReply(stripNoReply(reactEmoji ? String(raw).replace(reactMatch[0], '') : String(raw ?? '')));
    if (!cleaned) { engagement.recordResponse(scopeKey, message.id); return null; }
    const inventory = await guildInventory(message);
    const idMap = inventory?.channelIds ?? null;
    const parts = splitLong(cleaned).map((p) => clickableChannels(p, idMap));
    const channel = message.channel;
    if (reactEmoji) await message.react(reactEmoji).catch(() => {});
    // Use the Discord "reply" feature only when it actually helps: when the
    // message we are answering is no longer the last one in the channel.
    const answerIsLatest = await channel.messages.fetch({ limit: 1 }).then((ms) => ms.first()?.id === message.id).catch(() => false);
    if (!parts[0]) { engagement.recordResponse(scopeKey, message.id); return null; }
    const lastOurs = answerIsLatest ? null : await channel.messages.fetch({ limit: 1 }).then((ms) => ms.first()).catch(() => null);
    if (lastOurs && lastOurs.author?.id === client.user.id && lastOurs.content === parts[0]) {
      // The model looper answer again — our previous reply already says it.
      engagement.recordResponse(scopeKey, message.id);
      return null;
    }
    const first = answerIsLatest
      ? await channel.send({ content: parts[0], allowedMentions: { parse: [] } })
      : await replyOrSend(channel, message, parts[0]);
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
    rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nLoop: ${String(raw).slice(0, 1500)}`, message.channelId);
    if (Date.now() - (sentReplies.get(message.id)?.at ?? 0) > 10 * 60 * 60 * 1000) sentReplies.delete(message.id);
    return first;
  };

  // Streaming reply: posts the answer the moment the first token arrives, then
  // edits it progressively until the model is done — Discord shows text at ~2s
  // instead of after the whole 25-40s turn. Final semantics mirror sendReply:
  // clickable channels, 2000-char spill messages, markers (##REACT## applied,
  // ##NO_REPLY## → all posted parts deleted, ##GHOSTEDIT## → parts deleted +
  // silent edit of an older message). Returns the final raw content, or null
  // when nothing visible should remain.
  async function streamReply({ message, context, decision, mode, scopeKey }) {
    if (!runtime.agent?.converse) return null;
    // One reply per user message, ever: a decide-mode turn that lost its stream
    // and an engaged-mode turn can otherwise double-post the same answer.
    if (sentReplies.has(message.id)) return null;
    const channel = message.channel;
    // Prefetch while typing: the first post should not wait on a fresh
    // guild-inventory fetch when the first token lands.
    const inventoryPromise = guildInventory(message).catch(() => null);
    let posted = null, parts = [], buffer = '', firstPosted = false, idMap = null;
    let editTimer = null, typing = null, postingPromise = null;
    let pendingTail = '';
    const armTyping = () => { sendTyping(message); typing = setInterval(() => sendTyping(message), 9_000); typing.unref?.(); };
    const stopTyping = () => { if (typing) { clearInterval(typing); typing = null; } };
    const scrubLine = (l) => { const t = l.trim(); return t && !/^[^@#\n]{0,40}\s*(?:—|–)\s*\d{1,2}:\d{2}\b[^\n]{0,60}$/.test(t) && !/^[^#\n]{1,40}\s+is\s+typing\.{2,}$/i.test(t) && !/^(?:looking at this[,.]?|let(?:'s| me) (?:start|begin|take a look at|look|check|explore|see|read|investigate|dig|search|understand)|i need to (?:understand|see|check|look)|i(?:'m|'ll| will) (?:go(?:ing)? to )?(?:look|check|explore|see|read|open|inspect|examine|search|investigate|dig|start)|first[,:]?\s+i (?:need|should|want)|my (?:next )?step is|so[,;]?\s+let(?:'s| me) (?:start|begin|look|check|explore))[^\n]{0,220}$/i.test(t); };
    const visibleText = () => {
      const t = String(buffer ?? '').replace(/^##GHOSTEDIT##\s*/i, '').replace(/##REACT:\s*[^#\n]{1,40}\s*#*(?=\s*(?:\n|$))/g, '');
      return stripNoReply(t);
    };
    const currentText = () => {
      const t = visibleText();
      const idx = parts.length || 1;
      return t.slice((idx - 1) * 2000, idx * 2000);
    };
    const editVisible = async () => {
      if (!posted) return;
      const text = clickableChannels(currentText().slice(0, 2000), idMap);
      if (!text) return;
      try { await posted.edit({ content: text, allowedMentions: { parse: [] } }); } catch { /* noop */ }
    };
    const scheduleEdit = () => {
      if (editTimer || !posted) return;
      editTimer = setTimeout(() => { editTimer = null; editVisible(); }, 900);
      editTimer.unref?.();
    };
    const postFirst = async () => {
      try {
        idMap = (await inventoryPromise)?.channelIds ?? null;
        const answerIsLatest = await channel.messages.fetch({ limit: 1 }).then((ms) => ms.first()?.id === message.id).catch(() => false);
        const text = clickableChannels(currentText().slice(0, 2000), idMap);
        if (!text) return;
        let target = null;
        if (!answerIsLatest) {
          // Never double-post: if our last message in the channel already says
          // exactly this, reuse it and keep editing it instead of posting again.
          const lastOurs = await channel.messages.fetch({ limit: 1 }).then((ms) => ms.first()).catch(() => null);
          if (lastOurs?.author?.id === client.user.id && lastOurs.content === text) target = lastOurs;
          else target = await replyOrSend(channel, message, text);
        } else {
          target = await channel.send({ content: text, allowedMentions: { parse: [] } });
        }
        posted = target;
        parts.push(posted);
        botMessages.set(posted.id, { channelId: channel.id, at: Date.now() });
        sentReplies.set(message.id, { botMessageId: posted.id, channelId: channel.id, at: Date.now() });
        stopTyping();
        scheduleEdit();
      } catch { /* first post failed — classic sendReply below salvages it */ }
    };
    const ensureSpill = async () => {
      if (!posted || parts.length === 0) return;
      if (visibleText().length <= parts.length * 2000) return;
      try { await posted.edit({ content: clickableChannels(currentText().slice(0, 2000), idMap), allowedMentions: { parse: [] } }); } catch {}
      try {
        const extra = await channel.send({ content: clickableChannels(visibleText().slice(parts.length * 2000, (parts.length + 1) * 2000), idMap), allowedMentions: { parse: [] } });
        posted = extra; parts.push(extra);
        botMessages.set(extra.id, { channelId: channel.id, at: Date.now() });
      } catch { /* overflow post failed — final edits still apply */ }
    };
    const onDelta = (delta) => {
      if (!delta) return;
      pendingTail += delta;
      let nl;
      while ((nl = pendingTail.indexOf('\n')) >= 0) {
        const line = pendingTail.slice(0, nl + 1);
        pendingTail = pendingTail.slice(nl + 1);
        if (scrubLine(line)) buffer += line;
      }
      if (!firstPosted) { firstPosted = true; postingPromise = postFirst(); return; }
      if (visibleText().length > parts.length * 2000) void ensureSpill();
      else scheduleEdit();
    };
    armTyping();
    let raw = null;
    try { raw = await runtime.agent.converse({ message, context, decision, mode, onDelta }); }
    catch (err) { logger.warn?.({ err, scopeKey }, 'streaming conversation failed'); }
    stopTyping();
    if (editTimer) { clearTimeout(editTimer); editTimer = null; }
    // The first post may still be in flight — wait for it before deciding the
    // classic fallback, otherwise both paths post the same answer twice.
    if (postingPromise) { try { await postingPromise; } catch { /* postFirst self-catches */ } }
    if (pendingTail) {
      if (scrubLine(pendingTail)) buffer += pendingTail;
      pendingTail = '';
    }
    const final = sanitizeReply(String(raw ?? ''));
    if (!firstPosted || !posted) {
      if (!final || final.includes('##NO_REPLY##')) return null;
      await sendReply({ message, raw: final, scopeKey });
      return final;
    }
    // The live message streamed draft-text that the final sanitize has since
    // cut (draft seams, echo collapse). Reconcile the posted parts to the
    // clean final text: truncate surplus parts and edit the rest.
    const reconcile = String(stripReact(stripNoReply(final)) ?? '').trim();
    const wanted = reconcile ? splitLong(reconcile).map((p) => clickableChannels(p, idMap)) : [];
    for (let i = 0; i < parts.length; i++) {
      if (i >= wanted.length) { parts[i].delete().catch(() => {}); continue; }
      if ((parts[i].content ?? '') !== wanted[i]) parts[i].edit({ content: wanted[i], allowedMentions: { parse: [] } }).catch(() => {});
    }
    parts.length = Math.min(parts.length, wanted.length);
    const reactMatch = final.match(reactMarker);
    if (reactMatch) await message.react(reactMatch[1].trim()).catch(() => {});
    if (final.includes('##NO_REPLY##') || !visibleText().trim()) {
      for (const p of parts) p.delete().catch(() => {});
      sentReplies.delete(message.id);
      return null;
    }
    if (/^##GHOSTEDIT##/i.test(final)) {
      for (const p of parts) p.delete().catch(() => {});
      sentReplies.delete(message.id);
      if (await maybeGhostEdit(message, final)) return final;
    }
    engagement.recordResponse(scopeKey, posted.id);
    rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nLoop: ${final.slice(0, 1500)}`, message.channelId);
    return final;
  }

  async function maybeRunServerTask(message) {
    if (!(await isServerOwner(message))) return null;
    // One task attempt per message, ever: a late MessageUpdate replay (or a
    // dropped retry) must not raise a second "on it" ack or a second plan.
    if (taskAttempted.has(message.id)) return null;
    taskAttempted.set(message.id, Date.now());
    const content = message.content.trim();
    if (/\?\s*$/.test(content) || /^(how|what|why|which|when|where|who|can|could|should|would|is|are|do|does|will|did)\b/i.test(content)) return null;
    const probe = [message.channel?.name, content].filter(Boolean).join(' ');
    if (!serverOpIntent.test(probe) || !serverDomain.test(probe)) return null;
    if (!runtime.agent?.planner || !runtime.autonomy) return null;
    const botId = client.user.id;
    try {
      const guild = (await runtime.db.query(`INSERT INTO guilds(discord_id,name) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET name=excluded.name RETURNING *`, [message.guildId, message.guild?.name ?? null])).rows[0];
      const user = (await runtime.db.query(`INSERT INTO users(discord_id,username) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username RETURNING *`, [message.author.id, message.author.username])).rows[0];
      const ack = await message.reply({ content: `on it.`, allowedMentions: { parse: [] } });
      try {
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
const actor = { id: message.author.id, guildId: message.guildId, authenticated: true, guildMember: true, bot: false, isOwner: true, permissions: message.memberPermissions?.toArray?.() ?? [] };
        const safe = proposal.machinePlan.steps.filter((s) => !s.irreversible && s.risk !== 'high').map((s) => s.id);
        const decision = await runtime.autonomy.approvals.decide({ token: grant.token, proposal, actor, decision: 'approve_all', selectedStepIds: safe, policy: { default: { autonomy: 'operator' } }, budget: { limit: runtime.agent.router?.budgetUsd ?? 5, spent: 0 } });
        const result = await runtime.autonomy.executor.start({ proposal, decision, actor });
        const titles = proposal.machinePlan.steps.slice(0, 3).map((s) => s.title).join(' \u00b7 ');
        await ack.edit({ ...receiptPanel(result.receipt), content: `done: ${titles}${proposal.machinePlan.steps.length > 3 ? ` +${proposal.machinePlan.steps.length - 3} more` : ''}`, allowedMentions: { parse: [] } }).catch(() => {});
        return { task, plan };
      } catch (err) {
        logger.warn({ err, content: message.content }, 'chat task failed');
        await ack.edit({ content: `that one failed mid-flight, nothing was changed. it\u2019s logged \u2014 try again or rephrase.`, allowedMentions: { parse: [] } }).catch(() => {});
        return 'failed';
      }
    } catch (err) {
      logger.warn({ err, content: message.content }, 'chat task could not start');
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
      const actor = { id: message.author.id, guildId: message.guildId, authenticated: true, guildMember: true, bot: false, isOwner: true, permissions: message.memberPermissions?.toArray?.() ?? [] };
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

  const guildInventoryCache = new Map();

  // Real, current server truth (channels + members) so the model never claims
  // it "can't see" the server. Cached 60s per guild.
  async function guildInventory(message) {
    const guild = message.guild;
    if (!guild) return null;
    const cached = guildInventoryCache.get(guild.id);
    if (cached && Date.now() - cached.at < 60_000) return cached.data;
    try {
      const [channels, members] = await Promise.all([guild.channels.fetch(), guild.members.fetch({ limit: 100 }).catch(() => new Map())]);
      const found = [...channels.values()]
        .filter((c) => c.type === 0 || c.type === 5 || c.type === 15)
        .slice(0, 40);
      const channelNames = found.map((c) => `#${c.name}${c.parent ? ` (in ${c.parent.name})` : ''}`);
      const channelIds = Object.fromEntries(found.map((c) => [c.name, c.id]));
      const memberNames = [...members.values()].slice(0, 40).map((m) => m.displayName);
      const data = { serverName: guild.name, memberCount: guild.memberCount ?? members.size, channels: channelNames, channelIds, members: memberNames };
      guildInventoryCache.set(guild.id, { at: Date.now(), data });
      return data;
    } catch (err) { logger.warn?.({ err, guildId: guild.id }, 'guild inventory fetch failed'); return null; }
  }

  async function assembleContext(message, { lean = false } = {}) {
    const assembled = await context.assemble({
      messageId: message.id,
      guildId: message.guildId,
      channelId: message.channel?.isThread?.() ? message.channel.parentId : message.channelId,
      threadId: message.channel?.isThread?.() ? message.channelId : null,
      userId: message.author.id,
      maxTokens: lean ? 1500 : 6000,
      lean,
    });
    if (lean) {
      assembled.recentMessages = assembled.recentMessages.slice(-8);
      assembled.exactReferenceChain = assembled.exactReferenceChain.slice(-3);
      assembled.userMemories = assembled.userMemories.slice(0, 10);
      assembled.semanticMemories = [];
      assembled.activeTasks = [];
    }
    assembled.authorName = message.member?.displayName ?? message.author.username;
    assembled.guildInventory = await guildInventory(message);
    const channel = message.channel;
    if (channel) {
      assembled.currentChannel = {
        id: channel.id,
        name: channel.isThread?.() ? (channel.parent?.name ?? channel.name) : channel.name,
        thread: channel.isThread?.() ? channel.name : null,
        topic: channel.topic ?? null,
        mentions: channel.mentions?.users ? [...channel.mentions.users.values()].map((u) => u.username) : [],
      };
    }
    return assembled;
  }

  // Unified single-call turn for messages that did not explicitly engage Loop.
  // The model itself decides whether a reply is warranted, so we avoid a slow
  // serial classifier + answer double round-trip.
  async function maybeAutoReply(message, decision) {
    const scopeKey = decision.scopeKey;
    const now = Date.now();
    const lastAuto = autoReplyAt.get(scopeKey) ?? 0;
    if (now - lastAuto < 8_000) return null;
    autoReplyAt.set(scopeKey, now);
    if (!runtime.agent?.converse) return null;
    const assembled = await assembleContext(message, { lean: true });
    const response = await streamReply({ message, context: assembled, decision: { ...decision, reason: 'auto_decision' }, mode: 'decide', scopeKey });
    return response === null ? false : true;
  }

  async function routeMessage(message, isEdit) {
    if (message.partial) await message.fetch().catch(() => null);
    const dedupeNow = Date.now();
    for (const [id, t] of handledIds) if (dedupeNow - t > 120_000) handledIds.delete(id);
    for (const [id, t] of firstSeenAt) if (dedupeNow - t > 120_000) firstSeenAt.delete(id);
    for (const [id, t] of taskAttempted) if (dedupeNow - t > 600_000) taskAttempted.delete(id);
    if (handledIds.has(message.id)) {
      // Edits re-use the original message id: never drop them on dedupe.
      if (!isEdit) return;
    } else {
      handledIds.set(message.id, dedupeNow);
    }
    // A Discord edit event for a message whose turn is still running would
    // start a second concurrent model turn (and a second reply). Drop it.
    if (isEdit && inFlightTurns.has(message.id)) return;
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

    // Real-time AutoMod Protection
    if (message.guildId && !message.author?.bot && runtime.native?.automod) {
      const scan = runtime.native.automod.scanMessage(message.content);
      if (scan.flagged) {
        try {
          await message.delete().catch(() => {});
          await message.channel.send({
            flags: V2,
            components: [
              notice({
                title: `🛡️ AUTOMOD ENFORCEMENT: ${scan.ruleType.toUpperCase()}`,
                body: `<@${message.author.id}> — Your message was removed.\n**Reason:** ${scan.reason}`,
              }),
            ],
          });
          return;
        } catch (err) {
          logger.warn({ err: err.message }, 'automod enforcement error');
        }
      }
    }

    // Sticky channel messages
    if (message.guildId && !message.author?.bot && runtime.native?.sticky) {
      runtime.native.sticky.onChannelMessage(message).catch(() => {});
    }

    const decision = engagement.decide({
      authorBot: message.author?.bot,
      webhookId: message.webhookId,
      selfAuthored: message.author?.id === botId,
      isDM: !message.guildId,
      mentionsLoop: message.mentions?.users?.has(botId),
      repliesToLoop: message.reference?.messageId ? await message.channel.messages.fetch(message.reference.messageId).then((m) => m.author.id === botId).catch(() => false) : false,
      activeTask: false,
      ownerCommand: message.guild?.ownerId === message.author?.id && /^loop[,!:\s]/i.test(message.content),
      channelId: message.channelId,
      threadId: message.channel?.isThread?.() ? message.channelId : null,
      userId: message.author?.id,
      content: message.content,
      question: /\?\s*$/.test(message.content),
      loopRelevant: /\bloop\b/i.test(message.content),
      recentLoopContext: false,
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
            const edited = stripNoReply(response ?? '');
            if (edited) {
              const target = await message.channel.messages.fetch(prior.botMessageId).catch(() => null);
              if (target) {
                await target.edit({ content: splitParts(response)[0], allowedMentions: { parse: [], repliedUser: false } });
                sentReplies.set(message.id, { ...prior, at: Date.now() });
                rememberExchange(message.author.id, message.guildId, `User edited to: ${message.content}\nLoop: ${splitParts(response)[0].slice(0, 1200)}`, message.channelId);
                logger.info({ messageId: message.id }, 'reply edited in place after user edit');
              }
            }
          } catch (err) { logger.warn({ err }, 'in-place reply edit failed'); }
          return;
        }
      }
    }

    let active = decision;
    if (active.engage || isEdit || (!isEdit && !message.author?.bot && message.guildId && message.content.trim().length >= 3)) {
      // One model turn per scope at a time: rapid-fire follow-ups get queued
      // and drained into a single turn on the newest message, so the bot never
      // answers the same moment three times or attaches stale answers.
      const scope = scopeOf(message);
      if (scopeBusy.has(scope)) {
        // A replayed copy of a message that is already queued/processing never
        // gets its own turn — it would double-answer.
        if (firstSeenAt.has(message.id)) return;
        firstSeenAt.set(message.id, Date.now());
        pendingScopes.set(scope, message); return;
      }
      scopeBusy.set(scope, true);
      inFlightTurns.add(message.id);
      try {
        if (!active.engage && !isEdit) {
          const approved = await maybeRunChatApproval(message, isEdit);
          if (approved) {
            engagement.recordResponse(active.scopeKey, message.id);
            rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nLoop: executed a chat-approved server proposal`, message.channelId);
            return;
          }
          if (await isServerOwner(message) && serverOpIntent.test(`#${message.channel?.name ?? ''} ${message.content}`) && serverDomain.test(`#${message.channel?.name ?? ''} ${message.content}`)) {
            const handedOff = await withTyping(message, () => maybeRunServerTask(message));
            if (handedOff) {
              engagement.recordResponse(active.scopeKey, message.id);
              rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nLoop: executed an approved server task`, message.channelId);
              return;
            }
          }
          if (await maybeAutoReply(message, decision)) return;
        }
        if (!active.engage && !isEdit) return;
        if (!isEdit && await isServerOwner(message)) {
          const outcome = await withTyping(message, async () => {
            if (await maybeRunChatApproval(message, isEdit)) return 'approval';
            if (await maybeRunServerTask(message)) return 'server_task';
            return null;
          });
          if (outcome === 'approval') {
            engagement.recordResponse(active.scopeKey, message.id);
            rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nLoop: executed a chat-approved server proposal`, message.channelId);
            return;
          }
          if (outcome === 'server_task') {
            engagement.recordResponse(active.scopeKey, message.id);
            rememberExchange(message.author.id, message.guildId, `User: ${message.content}\nLoop: executed an approved server task`, message.channelId);
            return;
          }
        }
        const assembled = await assembleContext(message);
        const response = await streamReply({ message, context: assembled, decision: active, mode: 'engaged', scopeKey: active.scopeKey });
        if (response === null) return;
      } finally {
        inFlightTurns.delete(message.id);
        scopeBusy.delete(scope);
        const queued = pendingScopes.get(scope);
        if (queued) {
          pendingScopes.delete(scope);
          handledIds.delete(queued.id);
          setTimeout(() => routeMessage(queued, Boolean(queued.editedTimestamp)), 400);
        }
      }
    }
  }

  async function handleMessageDelete(deleted) {
    const deletedId = deleted.id;
    const prior = sentReplies.get(deletedId);
    if (prior) {
      // The user deleted a message we answered. If our reply is still the last
      // message in the channel and recent, remove the now-orphaned reply.
      let cleanedUp = false;
      try {
        const last = await deleted.channel.messages.fetch({ limit: 1 }).then((ms) => ms.first()).catch(() => null);
        if (last?.id === prior.botMessageId && Date.now() - prior.at < 30 * 60 * 1000) {
          await deleted.channel.messages.delete(prior.botMessageId).catch(() => {});
          cleanedUp = true;
          logger.info({ messageId: deletedId }, 'orphaned reply removed after user deleted their message');
        }
      } catch (err) { logger.warn({ err }, 'orphaned reply cleanup failed'); }
      sentReplies.delete(deletedId);
      if (cleanedUp) {
        // Say a playful line instead of vanishing silently, bounded by cooldown.
        const key = deleted.channel?.id ?? deleted.channelId ?? 'dm';
        const lastSass = deletedSassAt.get(key) ?? 0;
        if (Date.now() - lastSass < 5 * 60 * 1000) return;
        deletedSassAt.set(key, Date.now());
        setTimeout(async () => {
          try { await deleted.channel.send({ content: deletedSassLines[Math.floor(Math.random() * deletedSassLines.length)], allowedMentions: { parse: [] } }); } catch { /* noop */ }
        }, 250);
      }
      return;
    }
    if (botMessages.has(deletedId)) {
      // Someone deleted one of Loop's messages — react playfully, once per
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
          const line = deletedSassLines[Math.floor(Math.random() * deletedSassLines.length)];
          await channel.send({ content: line, allowedMentions: { parse: [] } });
        } catch { /* noop */ }
      }, 1500);
    }

    // Ghost Ping Detection
    if (deleted.guild && !deleted.author?.bot && deleted.mentions?.users?.size > 0) {
      try {
        const mentionsList = [...deleted.mentions.users.values()].map((u) => `<@${u.id}>`).join(' ');
        await deleted.channel.send({
          flags: V2,
          components: [
            panel({
              title: '👻 GHOST PING DETECTED',
              body:
                `> **Author:** <@${deleted.author.id}> (\`${deleted.author.id}\`)\n` +
                `> **Targeted Mentions:** ${mentionsList}\n` +
                `> **Deleted Content:**\n\`\`\`\n${(deleted.content || '[No Text]').slice(0, 500)}\n\`\`\``,
              footer: 'Ghost Ping Guardian · Real-Time Incident Capture',
            }),
          ],
        });
      } catch (err) {
        logger.warn({ err: err.message }, 'ghost ping notification failed');
      }
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
