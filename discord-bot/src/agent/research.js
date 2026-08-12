import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function validateResearchUrl(value, policy) {
  const url = new URL(value); if (url.protocol !== 'https:') throw new Error('Only HTTPS research URLs are allowed');
  if (['localhost','127.0.0.1','::1'].includes(url.hostname) || /^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) throw new Error('Private network research URLs are denied');
  if (policy.allowedHosts?.length && !policy.allowedHosts.includes(url.hostname)) throw new Error('Research host is not allowlisted'); return url;
}
export class ResearchWorker {
  constructor({ repositories, policy, fetch = globalThis.fetch, quarantineRoot = join(process.cwd(), '.azure-quarantine') }) { this.repositories=repositories; this.policy=policy; this.fetch=fetch; this.root=quarantineRoot; }
  async gather({ taskId, stepId, urls }) {
    if (!Array.isArray(urls) || !urls.length || urls.length > 20) throw new Error('Research requires 1-20 URLs');
    const sources=[]; await mkdir(this.root,{recursive:true});
    for (const raw of urls) {
      const url=validateResearchUrl(raw,this.policy); const response=await this.fetch(url,{redirect:'error',signal:AbortSignal.timeout(this.policy.timeoutMs)});
      if (!response.ok) throw new Error(`Research source returned ${response.status}`); const type=(response.headers.get('content-type')??'').split(';')[0];
      if (!this.policy.allowedTypes.includes(type)) throw new Error(`Research content type denied: ${type}`); const declared=Number(response.headers.get('content-length')??0); if (declared>this.policy.maxBytes) throw new Error('Research artifact exceeds size budget');
      const bytes=new Uint8Array(await response.arrayBuffer()); if(bytes.byteLength>this.policy.maxBytes) throw new Error('Research artifact exceeds size budget');
      const sha256=createHash('sha256').update(bytes).digest('hex'); const file=join(this.root,`${randomUUID()}.quarantine`); await writeFile(file,bytes,{flag:'wx'});
      const evidence=await this.repositories.evidence.create({task_id:taskId,step_id:stepId,kind:'research_source',uri:url.toString(),sha256,payload:{contentType:type,size:bytes.byteLength,quarantined:true,path:file,gatheredAt:new Date().toISOString()}}); sources.push({evidenceId:evidence.id,url:url.toString(),sha256,contentType:type,size:bytes.byteLength});
    }
    return { gatheredEvidence:sources, synthesis:null };
  }
}
