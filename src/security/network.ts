import {existsSync,lstatSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve4,resolve6} from 'node:dns/promises';
import path from 'node:path';
import * as z from 'zod/v4';
import type {AppConfig} from '../shared/config.js';
const hostname=z.string().max(253).trim().toLowerCase().refine(value=>{
 if(!value)return true;
 if(value.includes('..')||value.endsWith('.')||value.includes('_'))return false;
 const parts=value.split('.');
 return parts.length>=2 && parts.every(part=>part.length>=1 && part.length<=63 &&
 /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)) &&
 !['localhost','local','internal','test','invalid','example'].includes(parts.at(-1)!);
},'Enter a public domain, not a URL or local name');
const schema=z.object({version:z.literal(1),domain:hostname,
 hostPort:z.number().int().min(1024).max(65535),
 sslMode:z.enum(['private-only','external-https'])}).strict();
export type NetworkPlan=z.infer<typeof schema>;
export class NetworkSettings {
 private plan:NetworkPlan;
 constructor(private readonly config:AppConfig){
  this.plan={version:1,domain:'',hostPort:config.MCP_BIND_PORT,sslMode:'private-only'};
  const file=config.MCP_NETWORK_DRAFT_FILE;
  let stat;
  try {stat=lstatSync(file);} catch(error){
   if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  }
  if(stat){
   if(!stat.isFile()||(stat.mode&0o077)!==0)throw Error('Network draft must be private');
   this.plan=schema.parse(JSON.parse(readFileSync(file,'utf8')));
  }
 }
 snapshot(){
  return {applied:{origin:this.config.origin,internalPort:this.config.MCP_PORT,
    hostPort:this.config.MCP_BIND_PORT,
    hostBind:this.config.MCP_PRIVATE_CONTAINER==='true'||this.config.MCP_HOST==='127.0.0.1'?'127.0.0.1':'configured externally',
    ssl:this.config.secureCookies?'native-https-configured':'not-configured',
    publicReady:false},draft:this.plan,domainConfigured:false,sslCertificateManaged:false,
    applyInstruction:'sudo bash scripts/apply-network.sh',
    note:'Saving a plan does not change DNS, certificates, public HTTPS or the Docker port. Apply private host port over SSH.'};
 }
 validate(input:unknown):NetworkPlan{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid network plan');
  const data=input as Record<string,unknown>;
  const next=schema.parse({version:1,domain:data.domain,hostPort:data.hostPort,sslMode:data.sslMode});
  if(next.sslMode==='external-https'&&!next.domain)throw Error('Domain required for external HTTPS planning');
  return next;
 }
 save(input:unknown){
  const next=this.validate(input);
  const file=this.config.MCP_NETWORK_DRAFT_FILE;
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
   writeFileSync(tmp,JSON.stringify(next),{flag:'wx',mode:0o600});
   renameSync(tmp,file);this.plan=next;
  }finally{if(existsSync(tmp))unlinkSync(tmp);}
  return this.snapshot();
 }
 async dnsCheck(){
  if(!this.plan.domain)return {domain:'',state:'not-configured',ipv4:[],ipv6:[]};
  const domain=this.plan.domain;
  const [v4,v6]=await Promise.allSettled([resolve4(domain),resolve6(domain)]);
  const ipv4=v4.status==='fulfilled'?v4.value.slice(0,8):[];
  const ipv6=v6.status==='fulfilled'?v6.value.slice(0,8):[];
  return {domain,state:ipv4.length||ipv6.length?'resolved':'not-resolved',ipv4,ipv6,
   warning:'DNS resolution is not proof of domain ownership, an installed SSL certificate or a deployed public gateway'};
 }
}