const estimate = (value) => Math.ceil(JSON.stringify(value).length/4);
const trimText = (value,max=4000) => String(value??'').slice(0,max);
export class ContextAssembler {
  constructor({db, semanticSearch=null, maxTokens=6000, recentLimit=30, referenceDepth=8}) { Object.assign(this,{db,semanticSearch,maxTokens,recentLimit,referenceDepth}); }
  async assemble({messageId,guildId,channelId,threadId,userId,maxTokens=this.maxTokens}) {
    const [exact,tasks,memories,guildFacts]=await Promise.all([
      (async()=>{ const chain=[]; let current=messageId; for(let depth=0;current&&depth<this.referenceDepth;depth++){ const row=(await this.db.query(`SELECT m.*,u.discord_id author_discord_id,u.username FROM messages m LEFT JOIN users u ON u.id=m.author_id WHERE m.discord_id=$1`,[current])).rows[0]; if(!row)break; chain.unshift(row); current=row.referenced_message_id; } return chain; })(),
      this.db.query(`SELECT id,goal,status,domain,risk,metadata,updated_at FROM tasks WHERE status IN ('pending','running') AND ($1::text IS NULL OR metadata->>'discordGuildId'=$1) ORDER BY updated_at DESC LIMIT 10`,[guildId??null]).then((r)=>r.rows),
      this.db.query(`SELECT kind,content,metadata,updated_at FROM memories WHERE (metadata->>'discordGuildId'=$1 OR $1 IS NULL) AND (metadata->>'discordUserId'=$2 OR user_id IS NULL) ORDER BY updated_at DESC LIMIT 30`,[guildId??null,userId??null]).then((r)=>r.rows),
      this.db.query('SELECT name,settings,updated_at FROM guilds WHERE discord_id=$1',[guildId]).then((r)=>r.rows),
    ]);
    const seen=new Set(userId?[userId]:[]);
    const recent=(await this.db.query(`SELECT m.*,u.discord_id author_discord_id,u.username FROM messages m JOIN conversations c ON c.id=m.conversation_id LEFT JOIN users u ON u.id=m.author_id WHERE c.channel_id=$1 AND (c.thread_id=$2 OR (c.thread_id IS NULL AND $2 IS NULL)) AND m.discord_id<>$3 ORDER BY m.created_at DESC LIMIT $4`,[channelId,threadId??null,messageId,this.recentLimit])).rows.reverse().map((r)=>{if(r.author_discord_id)seen.add(r.author_discord_id);return this.#message(r);});
    const exactMsgs=exact.map((r)=>{if(r.author_discord_id)seen.add(r.author_discord_id);return this.#message(r);});
    const aliasMap=new Map(); if(seen.size){const aliasRows=(await this.db.query('SELECT discord_id,alias FROM user_aliases WHERE discord_id=ANY($1)',[[...seen]])).rows; for(const r of aliasRows)aliasMap.set(r.discord_id,r.alias);}
    for(const m of exactMsgs)if(m.authorId&&aliasMap.has(m.authorId))m.author=aliasMap.get(m.authorId);
    for(const m of recent)if(m.authorId&&aliasMap.has(m.authorId))m.author=aliasMap.get(m.authorId);
    let semantic=[]; if(this.semanticSearch) semantic=await this.semanticSearch({guildId,userId,query:exactMsgs.at(-1)?.content??'',limit:8});
    const context={identity:'Azure',observedAt:new Date().toISOString(),exactReferenceChain:exactMsgs,recentMessages:recent,activeTasks:tasks,userMemories:memories,guildFacts,semanticMemories:semantic,userAlias:aliasMap.get(userId)??null};
    this.#budget(context,maxTokens); return {...context,estimatedTokens:estimate(context)};
  }
  #message(r){return {id:r.discord_id,authorId:r.author_discord_id,author:r.username,content:trimText(r.content),attachments:r.metadata?.attachments??[],mentions:r.metadata?.mentions??{},reference:r.metadata?.reference??null,editedAt:r.last_discord_edited_at,deletedAt:r.deleted_at,createdAt:r.created_at};}
  #budget(c,max){ const removable=['semanticMemories','guildFacts','userMemories','activeTasks','recentMessages']; for(const key of removable){while(estimate(c)>max&&c[key].length)c[key].shift();} if(estimate(c)>max) for(const m of c.exactReferenceChain)m.content=trimText(m.content,1000); }
}
