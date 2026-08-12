import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const forbiddenCommand=/\b(deploy|publish|kubectl|terraform\s+apply|docker\s+(push|compose\s+up)|git\s+push|npm\s+publish)\b/i;
export function assertSandboxPolicy(command) { if (forbiddenCommand.test(command)) throw new Error('Deployment and production mutation commands require owner approval and are unavailable to code workers'); }
function run(command,cwd,timeoutMs) { assertSandboxPolicy(command); return new Promise((resolveRun,reject)=>{ const child=spawn(command,{cwd,shell:true,windowsHide:true,env:{...process.env,CI:'true'} }); let stdout='',stderr=''; const limit=1024*1024; child.stdout.on('data',(d)=>stdout=(stdout+d).slice(-limit)); child.stderr.on('data',(d)=>stderr=(stderr+d).slice(-limit)); const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`Validation timed out: ${command}`));},timeoutMs); child.on('error',reject); child.on('close',(code)=>{clearTimeout(timer);resolveRun({command,code,stdout,stderr});}); }); }
export class CodeWorker {
  constructor({repositories,workspaceRoot,validationCommands,commandTimeoutMs=120000}) { this.repositories=repositories; this.workspaceRoot=resolve(workspaceRoot); this.commands=validationCommands; this.timeout=commandTimeoutMs; }
  async execute({taskId,stepId,patch,applyPatch}) {
    if(typeof patch!=='string'||!patch.trim()) throw new Error('A patch is required'); const sandbox=await mkdtemp(join(tmpdir(),'azure-code-'));
    try {
      await run(`git clone --no-hardlinks --local "${this.workspaceRoot}" .`,sandbox,this.timeout); const patchFile=join(sandbox,'change.patch'); await writeFile(patchFile,patch,{flag:'wx'});
      if(applyPatch) await applyPatch({sandbox,patchFile}); else { const applied=await run('git apply --check change.patch && git apply change.patch',sandbox,this.timeout); if(applied.code!==0) throw new Error(`Patch rejected: ${applied.stderr}`); }
      const results=[]; for(const command of this.commands){const result=await run(command,sandbox,this.timeout); results.push(result); if(result.code!==0) break;}
      const diff=await run('git diff --binary --no-ext-diff',sandbox,this.timeout); const artifact=await readFile(patchFile); const sha256=createHash('sha256').update(artifact).digest('hex');
      const evidence=await this.repositories.evidence.create({task_id:taskId,step_id:stepId,kind:'code_patch',sha256,payload:{sandboxed:true,deploymentPerformed:false,validation:results,diff:diff.stdout}});
      return {evidenceId:evidence.id,sha256,validation:results,verified:results.length===this.commands.length&&results.every((r)=>r.code===0),deploymentPerformed:false};
    } finally { await rm(sandbox,{recursive:true,force:true}); }
  }
}
