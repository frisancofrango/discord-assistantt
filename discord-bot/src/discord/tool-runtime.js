import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { evaluatePolicy } from '../foundation/policy.js';
const hash=(v)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class ToolError extends Error { constructor(code,message,details={}){super(message);this.name='ToolError';this.code=code;this.details=details;} }
export class DiscordToolRegistry {
  constructor({repositories=null,db=null,logger=console}={}){this.tools=new Map();Object.assign(this,{repositories,db,logger});}
  register(def){if(this.tools.has(def.name))throw new ToolError('duplicate_tool',`Tool ${def.name} already exists`);if(!def.schema?.safeParse||!def.execute||!def.verify)throw new ToolError('invalid_definition','Tools require schema, execute and verify');this.tools.set(def.name,Object.freeze(def));return this;}
  describe(){return [...this.tools.values()].map(({name,domain,risk,requiredPermissions=[],irreversible=false,unsupportedReason})=>({name,domain,risk,requiredPermissions,irreversible,unsupportedReason}));}
  async invoke(name,raw,ctx={}){
    const tool=this.tools.get(name);if(!tool)throw new ToolError('unsupported_operation',`Unsupported Discord operation: ${name}`);
    if(tool.unsupportedReason)throw new ToolError('unsupported_operation',tool.unsupportedReason);
    const parsed=tool.schema.safeParse(raw);if(!parsed.success)throw new ToolError('invalid_input','Tool input failed schema validation',{issues:parsed.error.issues});
    const input=parsed.data,key=ctx.idempotencyKey;if(!key)throw new ToolError('missing_idempotency_key','idempotencyKey is required');
    const inputHash=hash(input);let prior=null;if(this.db){prior=(await this.db.query('SELECT * FROM tool_idempotency WHERE idempotency_key=$1',[key])).rows[0];if(prior){if(prior.tool_name!==name||prior.input_hash!==inputHash)throw new ToolError('idempotency_conflict','Key was already used with different input');if(prior.status==='completed')return {...prior.result,idempotent:true};}}
    const decision=evaluatePolicy({domain:tool.domain,risk:tool.risk,autonomy:ctx.autonomy??'advisor',behavior:tool.behavior,actor:ctx.actor??{},requiredPermissions:tool.requiredPermissions,approval:ctx.approval,bulk:tool.bulk?.(input),consent:ctx.consent,confirmedFinancialScope:ctx.confirmedFinancialScope});
    await this.repositories?.audit?.record({guild_id:ctx.guildRecordId,actor_id:ctx.actorRecordId,action:name,domain:tool.domain,risk:tool.risk,decision:decision.allowed?'allowed':decision.requiresApproval?'approval_required':'denied',reason:decision.reason,correlation_id:ctx.correlationId??null,metadata:{idempotencyKey:key}});
    if(!decision.allowed)throw new ToolError(decision.requiresApproval?'approval_required':'authorization_denied',decision.reason);
    await tool.preflight?.(input,ctx);
    if(this.db)await this.db.query(`INSERT INTO tool_idempotency(idempotency_key,tool_name,input_hash,status) VALUES($1,$2,$3,'running') ON CONFLICT(idempotency_key) DO UPDATE SET updated_at=now()`,[key,name,inputHash]);
    const invocationId=randomUUID(),before=await tool.snapshot?.(input,ctx);
    try{const executed=await tool.execute(input,ctx);const verification=await tool.verify(input,executed,ctx);if(!verification?.verified)throw new ToolError('verification_failed',`Verification failed for ${name}`,verification);const evidence={invocationId,tool:name,input,before,executed,verification,at:new Date().toISOString()};let evidenceId=null;if(this.repositories)evidenceId=(await this.repositories.evidence.create({invocation_id:ctx.invocationId,kind:'discord_tool_receipt',payload:evidence,sha256:hash(evidence)})).id;const result={ok:true,invocationId,evidenceId,resourceIds:verification.resourceIds??executed?.resourceIds??[],before,output:executed,verification,compensation:tool.compensate?{tool:name,input:await tool.compensationInput?.(input,before,executed)??{input,before}}:null};if(this.db)await this.db.query(`UPDATE tool_idempotency SET status='completed',result=$2,updated_at=now() WHERE idempotency_key=$1`,[key,JSON.stringify(result)]);return result;}catch(error){if(this.db)await this.db.query(`UPDATE tool_idempotency SET status='failed',error=$2,updated_at=now() WHERE idempotency_key=$1`,[key,JSON.stringify({code:error.code,message:error.message})]);throw error;}
  }
  async compensate(name,data,ctx={}){const tool=this.tools.get(name);if(!tool?.compensate)throw new ToolError('irreversible','No compensation is available');await tool.preflight?.(data.input,ctx);const output=await tool.compensate(data,ctx);return {output,verification:await tool.verifyCompensation?.(data,output,ctx)??{verified:true}};}
}
export { z };
