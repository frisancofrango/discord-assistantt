import { randomUUID } from 'node:crypto';
import { normalizeGatewayEvent, normalizeMessage, stableHash, safeStringify } from './normalize.js';

export class DiscordEventStore {
  constructor(db) { this.db=db; }
  async ingest(eventType, entity, extra = {}, client = this.db) {
    const event = eventType.startsWith('message') ? normalizeMessage(entity,eventType) : normalizeGatewayEvent(eventType,entity,extra);
    const correlation = extra.correlationId ?? randomUUID();
    if ((await client.query('SELECT 1 FROM discord_events WHERE gateway_key=$1', [event.gatewayKey])).rowCount) return { duplicate:true, event:null };
    const inserted = await client.query(`INSERT INTO discord_events(gateway_key,event_type,guild_id,channel_id,thread_id,user_id,resource_id,occurred_at,correlation_id,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(gateway_key) DO NOTHING RETURNING *`,
      [event.gatewayKey,event.eventType,event.guildId,event.channelId,event.threadId,event.userId,event.resourceId,event.occurredAt,correlation,safeStringify(event.payload)]);
    if (!inserted.rowCount) return { duplicate:true, event:null };
    if (eventType.startsWith('message')) await this.#persistMessage(event, client);
    return { duplicate:false, event:inserted.rows[0] };
  }
  async #upsertGuild(discordId,name,client) { if(!discordId)return null; return (await client.query(`INSERT INTO guilds(discord_id,name) VALUES($1,$2) ON CONFLICT(discord_id) DO UPDATE SET name=COALESCE(EXCLUDED.name,guilds.name),updated_at=now() RETURNING *`,[discordId,name])).rows[0]; }
  async #upsertUser(author,client) { if(!author?.id)return null; return (await client.query(`INSERT INTO users(discord_id,username,profile) VALUES($1,$2,$3) ON CONFLICT(discord_id) DO UPDATE SET username=EXCLUDED.username,profile=EXCLUDED.profile,updated_at=now() RETURNING *`,[author.id,author.username,JSON.stringify({globalName:author.globalName,bot:author.bot})])).rows[0]; }
  async #persistMessage(event,client) {
    const p=event.payload; const guild=await this.#upsertGuild(p.guildId,null,client); const user=await this.#upsertUser(p.author,client);
    let conversation=(await client.query(`SELECT * FROM conversations WHERE (guild_id=$1 OR (guild_id IS NULL AND $1 IS NULL)) AND channel_id=$2 AND (thread_id=$3 OR (thread_id IS NULL AND $3 IS NULL)) ORDER BY created_at LIMIT 1`,[guild?.id??null,p.parentChannelId??p.channelId,p.threadId])).rows[0];
    if(!conversation) conversation=(await client.query(`INSERT INTO conversations(guild_id,channel_id,thread_id,metadata) VALUES($1,$2,$3,$4) RETURNING *`,[guild?.id??null,p.parentChannelId??p.channelId,p.threadId,JSON.stringify({discordGuildId:p.guildId})])).rows[0];
    let message=(await client.query('SELECT * FROM messages WHERE discord_id=$1',[p.id])).rows[0];
    const metadata={attachments:p.attachments,mentions:p.mentions,reference:p.reference,components:p.components,embeds:p.embeds,stickers:p.stickers,pinned:p.pinned,hash:stableHash({content:p.content,attachments:p.attachments,mentions:p.mentions,reference:p.reference})};
    if(!message) message=(await client.query(`INSERT INTO messages(conversation_id,discord_id,author_id,content,metadata,referenced_message_id,last_discord_edited_at,deleted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[conversation.id,p.id,user?.id??null,p.content,safeStringify(metadata),p.reference?.messageId??null,p.editedAt,p.deleted?event.occurredAt:null])).rows[0];
    const latest=(await client.query('SELECT * FROM message_revisions WHERE message_id=$1 ORDER BY revision DESC LIMIT 1',[message.id])).rows[0];
    if(!latest || latest.metadata?.hash!==metadata.hash || p.deleted) {
      const revision=(latest?.revision??0)+1;
      await client.query(`INSERT INTO message_revisions(message_id,revision,content,metadata) VALUES($1,$2,$3,$4)`,[message.id,revision,p.content,safeStringify({...metadata,eventType:event.eventType,deleted:p.deleted,observedAt:event.occurredAt})]);
    }
    await client.query(`UPDATE messages SET content=$2,metadata=$3,referenced_message_id=$4,last_discord_edited_at=$5,deleted_at=CASE WHEN $6 THEN $7 ELSE deleted_at END,updated_at=now() WHERE id=$1`,[message.id,p.content,safeStringify(metadata),p.reference?.messageId??null,p.editedAt,p.deleted,event.occurredAt]);
  }
}
