const taskWords=/\b(azure|help|please|can you|could you|create|change|fix|moderate|summarize|explain|how|why|what)\b/i;
export class EngagementPolicy {
  constructor({cooldownMs=45_000, passiveThreshold=0.72, now=()=>Date.now()}={}) { Object.assign(this,{cooldownMs,passiveThreshold,now}); this.state=new Map(); }
  decide(input) {
    if(input.authorBot||input.webhookId) return this.#no('no_chatter_loops');
    if(input.selfAuthored) return this.#no('self_message');
    const deterministic = input.isDM?'direct_message':input.mentionsAzure?'mention':input.repliesToAzure?'reply':input.activeTask?'active_task':input.ownerCommand?'owner_command':(input.azureRelevant&&!input.lowSignal)?'name_mention':null;
    const key=input.threadId??input.channelId??input.userId; const state=this.state.get(key)??{};
    if(deterministic) return this.#yes(deterministic,key,input,{typing:true});
    if(input.isEdit && !input.materialEdit) return this.#no('immaterial_edit');
    if((state.consecutiveResponses??0)>=2) return this.#no('loop_guard');
    if(state.lastResponseAt&&this.now()-state.lastResponseAt<this.cooldownMs) return this.#no('cooldown');
    let score=0; if(taskWords.test(input.content??''))score+=.35; if(input.question)score+=.2; if(input.azureRelevant)score+=.3; if(input.recentAzureContext)score+=.12; if(input.lowSignal)score-=.35;
    if(score<this.passiveThreshold)return {...this.#no('passive_observation'),score};
    return this.#yes('relevant_passive_message',key,input,{score,typing:true});
  }
  recordResponse(scopeKey,messageId){const old=this.state.get(scopeKey)??{};this.state.set(scopeKey,{lastResponseAt:this.now(),lastMessageId:messageId,consecutiveResponses:(old.consecutiveResponses??0)+1});}
  recordHumanMessage(scopeKey){const old=this.state.get(scopeKey)??{};this.state.set(scopeKey,{...old,consecutiveResponses:0});}
  #yes(reason,scope,input,extra={}){return {engage:true,reason,scopeKey:scope,...extra,editedAwareness:Boolean(input.isEdit)};}
  #no(reason){return {engage:false,reason,typing:false};}
}
