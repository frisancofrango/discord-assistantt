export class Orchestrator {
  constructor({queue,repositories,workers,logger}) { this.queue=queue; this.repositories=repositories; this.workers=workers; this.logger=logger; this.worker=null; }
  start() { if(this.worker)return; this.worker=this.queue.work('agent-tasks',(data,controls)=>this.execute(data.taskId,controls),{concurrency:2}); }
  async enqueue(taskId,idempotencyKey){return this.queue.enqueue('agent-tasks','execute',{taskId},{idempotencyKey,attempts:1});}
  async execute(taskId,controls){
    const task=await this.repositories.tasks.get(taskId); if(!task)throw new Error('Task not found'); if(['completed','cancelled'].includes(task.status))return {status:task.status,idempotent:true};
    await this.repositories.tasks.update(taskId,{status:'running'}); const steps=await this.repositories.taskSteps.find({task_id:taskId},{limit:100}); steps.sort((a,b)=>a.position-b.position); const complete=new Set(steps.filter((s)=>s.status==='completed').map((s)=>s.input.id));
    try { for(const step of steps){ if(step.status==='completed')continue; if(await controls.isCancelled()){await this.repositories.tasks.update(taskId,{status:'cancelled'});return {status:'cancelled'};} const spec=step.input; if(!spec.dependsOn.every((id)=>complete.has(id)))throw new Error(`Dependencies incomplete for ${spec.id}`); await this.repositories.taskSteps.update(step.id,{status:'running'}); await controls.progress({step:spec.id,status:'running'});
      const worker=this.workers[spec.kind]; if(!worker)throw new Error(`No worker registered for ${spec.kind}`); const output=await worker({taskId,stepId:step.id,...spec.input});
      if(spec.verification.evidenceRequired&&!output?.evidenceId&&!output?.evidenceIds?.length)throw new Error(`Step ${spec.id} produced no persisted evidence`); if(output?.verified===false)throw new Error(`Step ${spec.id} verification failed`);
      await this.repositories.taskSteps.update(step.id,{status:'completed',output}); await this.repositories.taskCheckpoints.create({task_id:taskId,step_id:step.id,state:{step:spec.id,status:'completed',at:new Date().toISOString()}}).catch(async()=>{}); complete.add(spec.id);
    } await this.repositories.tasks.update(taskId,{status:'completed',metadata:{...(task.metadata??{}),completion:{verified:true,evidenceBacked:true,at:new Date().toISOString()}}}); return {status:'completed',verified:true};
    } catch(error){ const active=steps.find((s)=>s.status==='running'); if(active)await this.repositories.taskSteps.update(active.id,{status:'failed',error:{message:error.message}}); await this.repositories.tasks.update(taskId,{status:'failed',metadata:{...(task.metadata??{}),failure:{message:error.message,at:new Date().toISOString()}}}); throw error; }
  }
  async close(){await this.worker?.close();this.worker=null;}
}
