import { randomBytes, createHash } from 'node:crypto';
import { validateRelative } from '../tools/filesystem.js';
import * as z from 'zod/v4';
import type { AuditLog } from './audit.js';

export const operationSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('file.create'),path:z.string().min(1).max(180),content:z.string().max(16384)}).strict(),
  z.object({type:z.literal('docker.restart'),container:z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/)}).strict(),
  z.object({type:z.literal('deploy.sync')}).strict()
]);
export type WriteOperation=z.infer<typeof operationSchema>;
type Decision='pending'|'approved'|'denied';
type Approval={id:string;clientId:string;operation:WriteOperation;status:Decision;expires:number;busy:boolean};
const id=()=>randomBytes(24).toString('base64url');
function summary(op:WriteOperation) {
  if(op.type==='file.create'){
    const digest=createHash('sha256').update(op.content,'utf8').digest('hex').slice(0,16);
    const preview=op.content.slice(0,100).replace(/[\r\n\t]/g,' ');
    return 'Create file '+op.path+' ('+Buffer.byteLength(op.content)+' bytes, SHA256 '+digest+', preview: '+preview+')';
  }
  if(op.type==='docker.restart')return 'Restart allowlisted Docker container: '+op.container;
  return 'Fast-forward pull of configured deployment Git repository';
}

export class ApprovalQueue {
  private items=new Map<string,Approval>();
  constructor(private audit?:AuditLog){}
  private cleanup(){
    const now=Date.now();
    for(const [key,item] of this.items)if(item.expires<=now)this.items.delete(key);
    if(this.items.size>200) {
      for(const [key,item] of this.items)if(item.status!=='pending'&&!item.busy)this.items.delete(key);
    }
  }
  propose(clientId:string,input:unknown){
    this.cleanup();
    if(this.items.size>=200)throw new Error('Approval queue full');
    const op=operationSchema.parse(input);
    if(op.type==='file.create') validateRelative(op.path);
    const item:Approval={id:id(),clientId,operation:op,status:'pending',expires:Date.now()+5*60_000,busy:false};
    this.items.set(item.id,item);
    this.audit?.record('operation.propose','success',clientId,op.type);
    return {approvalId:item.id,summary:summary(op),expiresInSeconds:300,status:'pending'};
  }
  pending(){
    this.cleanup();
    return [...this.items.values()].filter(v=>v.status==='pending')
      .map(v=>({id:v.id,summary:summary(v.operation),clientId:v.clientId.slice(0,38),expires:v.expires}));
  }
  decide(approvalId:string,approve:boolean,admin:string){
    this.cleanup();
    const item=this.items.get(approvalId);
    if(!item||item.status!=='pending'||item.busy)throw new Error('Approval is missing or no longer pending');
    item.status=approve?'approved':'denied';
    this.audit?.record(approve?'operation.approve':'operation.reject',approve?'success':'denied',admin,item.operation.type);
    return {approved:approve,summary:summary(item.operation)};
  }
  async execute(approvalId:string,clientId:string,broker:(op:WriteOperation)=>Promise<unknown>){
    this.cleanup();
    const item=this.items.get(approvalId);
    if(!item||item.clientId!==clientId||item.status!=='approved'||item.busy)throw new Error('No matching approved operation');
    item.busy=true;
    item.status='denied'; // atomic one-time consume BEFORE any broker operation
    try {
      const result=await broker(item.operation);
      this.audit?.record('operation.execute','success',clientId,item.operation.type);
      return result;
    }catch{
      this.audit?.record('operation.execute','error',clientId,item.operation.type);
      throw new Error('Broker operation failed or was denied');
    }finally{this.items.delete(approvalId);}
  }
}
