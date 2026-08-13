import { createHash } from 'node:crypto';

const iso = (value) => value ? new Date(value).toISOString() : null;
const json = (value) => value?.toJSON?.() ?? value ?? null;
const values = (collection) => collection ? [...collection.values?.() ?? collection] : [];
const snowflakeTime = (id) => id && /^\d+$/.test(id) ? new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toISOString() : null;
/** JSON replacer that survives discord.js BigInt snowflakes. */
export const jsonSafeReplacer = (key, value) => {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
};
export const safeStringify = (value) => JSON.stringify(value, jsonSafeReplacer);
export const stableHash = (value) => {
  const allow = Object.keys(value ?? {}).sort();
  const picked = Object.fromEntries(allow.map((k) => [k, value[k]]));
  return createHash('sha256').update(safeStringify(picked)).digest('hex');
};

export function normalizeMessage(message, eventType = 'messageCreate') {
  const reference = message.reference ?? null;
  const payload = {
    id: message.id, guildId: message.guildId ?? null, channelId: message.channelId,
    threadId: message.channel?.isThread?.() ? message.channelId : null,
    parentChannelId: message.channel?.isThread?.() ? message.channel.parentId : null,
    author: message.author ? { id: message.author.id, username: message.author.username, globalName: message.author.globalName ?? null, bot: Boolean(message.author.bot) } : null,
    content: message.content ?? '', cleanContent: message.cleanContent ?? message.content ?? '',
    attachments: values(message.attachments).map((a) => ({ id:a.id, name:a.name, url:a.url, proxyUrl:a.proxyURL, size:a.size, contentType:a.contentType ?? null, description:a.description ?? null, height:a.height ?? null, width:a.width ?? null, ephemeral:Boolean(a.ephemeral) })),
    mentions: { users: values(message.mentions?.users).map((u)=>u.id), roles: values(message.mentions?.roles).map((r)=>r.id), channels: values(message.mentions?.channels).map((c)=>c.id), everyone:Boolean(message.mentions?.everyone) },
    reference: reference ? { messageId:reference.messageId ?? null, channelId:reference.channelId ?? null, guildId:reference.guildId ?? null, type:reference.type ?? null } : null,
    interaction: message.interactionMetadata ? json(message.interactionMetadata) : null,
    components: message.components?.map(json) ?? [], embeds: message.embeds?.map(json) ?? [],
    stickers: values(message.stickers).map((s)=>({id:s.id,name:s.name,format:s.format,type:s.type})),
    flags: message.flags?.bitfield?.toString?.() ?? null, pinned:Boolean(message.pinned), tts:Boolean(message.tts),
    createdAt: iso(message.createdAt) ?? snowflakeTime(message.id), editedAt: iso(message.editedAt), deleted: eventType === 'messageDelete',
  };
  return envelope(eventType, payload, message.id, payload.createdAt ?? new Date().toISOString(), payload);
}

export function normalizeGatewayEvent(eventType, entity, extra = {}) {
  if (eventType.startsWith('message')) return normalizeMessage(entity, eventType);
  const guildId = entity?.guildId ?? entity?.guild?.id ?? extra.guildId ?? null;
  const channelId = entity?.channelId ?? (entity?.isThread?.() ? entity.id : null) ?? extra.channelId ?? null;
  const resourceId = entity?.id ?? entity?.user?.id ?? extra.resourceId ?? null;
  const payload = { resource: json(entity), ...extra };
  return envelope(eventType, { guildId, channelId, threadId:entity?.isThread?.() ? entity.id : extra.threadId ?? null, userId:entity?.user?.id ?? entity?.id ?? extra.userId ?? null, ...payload }, resourceId, extra.occurredAt ?? new Date().toISOString(), payload);
}

function envelope(eventType, fields, resourceId, occurredAt, payload) {
  const discriminator = fields.editedAt ?? fields.deleted ?? fields.reaction ?? fields.sequence ?? stableHash(payload);
  return { eventType, guildId:fields.guildId ?? null, channelId:fields.channelId ?? null, threadId:fields.threadId ?? null, userId:fields.author?.id ?? fields.userId ?? null, resourceId, occurredAt, payload:fields, gatewayKey:`${eventType}:${resourceId ?? 'none'}:${discriminator}` };
}
