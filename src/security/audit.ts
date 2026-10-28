import { appendFile, mkdir, open } from 'node:fs/promises';
import path from 'node:path';

type Outcome = 'success'|'denied'|'error';
export type AuditEvent = {
  at: string;
  action: string;
  outcome: Outcome;
  actor: string;
  detail?: string;
};
const SAFE_ACTIONS = new Set(['login','logout','oauth.register','oauth.authorize','oauth.token','oauth.refresh','mcp.request','mcp.reject','panel.status','server.start','operation.propose','operation.approve','operation.reject','operation.execute','operation.dispatch']);
export class AuditLog {
  private recent: AuditEvent[] = [];
  private pending: Promise<void> = Promise.resolve();
  private writeFailed=false;
  constructor(private file: string) {}
  record(action: string, outcome: Outcome, actor = 'anonymous', detail?: string) {
    // Never record credentials, bearer tokens, cookie values, raw body or authorization codes.
    if (!SAFE_ACTIONS.has(action)) action = 'mcp.reject';
    const event: AuditEvent = {
      at: new Date().toISOString(), action, outcome,
      actor: actor.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0,64),
      ...(detail ? {detail: detail.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0,80)} : {})
    };
    this.recent.push(event);
    if (this.recent.length > 100) this.recent.shift();
    this.pending = this.pending.catch(()=>undefined).then(async () => {
      await mkdir(path.dirname(this.file), {recursive:true,mode:0o700});
      await appendFile(this.file, JSON.stringify(event)+'\n', {encoding:'utf8',mode:0o600});
      this.writeFailed=false;
    }).catch(()=>{this.writeFailed=true;process.stderr.write('Audit write failed; check storage permissions\n');});
  }
  async list(limit = 30): Promise<AuditEvent[]> {
    // Read the file rather than trusting only in-memory state after restart.
    await this.pending;
    try {
      const handle=await open(this.file,'r');
      try {
        const stat=await handle.stat();
        const length=Math.min(stat.size,64*1024);
        const buffer=Buffer.alloc(length);
        await handle.read(buffer,0,length,stat.size-length);
        const lines=buffer.toString('utf8').trim().split('\n');
        if(stat.size>length)lines.shift();
        return lines.filter(Boolean).slice(-Math.min(Math.max(1,limit),100)).map(v=>JSON.parse(v) as AuditEvent).reverse();
      } finally {await handle.close();}
    } catch { return this.recent.slice(-limit).reverse(); }
  }
  async flush() {await this.pending;}
  async ensureHealthy() {await this.pending;if(this.writeFailed)throw new Error('Audit persistence is unavailable');}
  async recordDurable(action:string,outcome:Outcome,actor='anonymous',detail?:string) {
    this.record(action,outcome,actor,detail);
    await this.ensureHealthy();
  }
}
