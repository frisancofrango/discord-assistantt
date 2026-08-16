const taskWords=/\b(loop|help|please|can you|could you|create|change|fix|moderate|summarize|explain|how|why|what|who|where|when|which|whose|organi[sz]e|restructure|set ?up|setup|manage|memory|remember|buy|sell|stock|product|order)\b/i;
const complaint=/\b(not (?:as |that |really |so )?smart|dumb|useless|bad|wrong|terrible|jfc|suck(?:s|ed)?|bullshit|worst|disappointed|hate|annoying|frustrat|hardcoded|generic|crap|wtf|stfu|fuck off|broken|slow)\b/i;
export class EngagementPolicy {
  constructor({cooldownMs=45_000,passiveThreshold=0.5,followUpMs=150_000,now=()=>Date.now()}={}) { Object.assign(this,{cooldownMs,passiveThreshold,followUpMs,now}); this.state=new Map(); }
  decide(input) {
    if(input.authorBot||input.webhookId) return this.#no('no_chatter_loops');
    if(input.selfAuthored) return this.#no('self_message');
    const key=input.threadId??input.channelId??input.userId; const state=this.state.get(key)??{};
    const followUp=Boolean(state.lastResponseAt&&this.now()-state.lastResponseAt<this.followUpMs)&&!input.lowSignal;
    const deterministic = input.isDM?'direct_message':input.mentionsLoop?'mention':input.repliesToLoop?'reply':input.activeTask?'active_task':input.ownerCommand?'owner_command':(input.loopRelevant&&!input.lowSignal)?'name_mention':null;
    if(deterministic) return this.#yes(deterministic,key,input,{typing:true});
    if(complaint.test(input.content??'')&&!input.lowSignal) return this.#yes('complaint',key,input,{typing:true,score:.4});
    if(input.isEdit && !input.materialEdit) return this.#no('immaterial_edit');
    if((state.consecutiveResponses??0)>=2&&!followUp) return this.#no('loop_guard');
    if(followUp&&(input.question||taskWords.test(input.content??'')||complaint.test(input.content??''))){let s=0;if(input.question)s+=.4;if(taskWords.test(input.content??''))s+=.35;if(complaint.test(input.content??''))s+=.3;return this.#yes('follow_up',key,input,{score:.35+s,typing:true,followUp:true});}
    if(state.lastResponseAt&&this.now()-state.lastResponseAt<this.cooldownMs) return this.#no('cooldown');
    let score=0; if(taskWords.test(input.content??''))score+=.35; if(input.question)score+=.2; if(input.loopRelevant)score+=.3; if(input.recentLoopContext)score+=.12; if(complaint.test(input.content??''))score+=.4; if(input.lowSignal)score-=.35;
    if(score<this.passiveThreshold)return {...this.#no('passive_observation'),score};
    return this.#yes('relevant_passive_message',key,input,{score,typing:true});
  }
  recordResponse(scopeKey,messageId){const old=this.state.get(scopeKey)??{};this.state.set(scopeKey,{lastResponseAt:this.now(),lastMessageId:messageId,consecutiveResponses:(old.consecutiveResponses??0)+1});}
  recordHumanMessage(scopeKey){const old=this.state.get(scopeKey)??{};this.state.set(scopeKey,{...old,consecutiveResponses:0});}
  #yes(reason,scope,input,extra={}){return {engage:true,reason,scopeKey:scope,...extra,editedAwareness:Boolean(input.isEdit)};}
  #no(reason){return {engage:false,reason,typing:false};}
}