import {existsSync,lstatSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import path from 'node:path';
import * as z from 'zod/v4';
import type {AppConfig} from '../shared/config.js';

const zoneIdSchema=z.string().regex(/^[a-f0-9]{32}$/i);
const tokenSchema=z.string().min(20).max(256).regex(/^[a-zA-Z0-9_-]+$/);
const stored=z.object({version:z.literal(1),zoneId:zoneIdSchema,zoneName:z.string().min(3).max(253),token:tokenSchema}).strict();
type Stored=z.infer<typeof stored>;
const TYPES=['A','AAAA','CNAME','TXT','MX'] as const;
type SupportedType=typeof TYPES[number];
const idSchema=z.string().regex(/^[a-f0-9]{32}$/i);
const planSchema=z.object({
 type:z.enum(TYPES),
 name:z.string().min(1).max(253),
 content:z.string().min(1).max(2048),
 ttl:z.number().int().refine(x=>x===1||(x>=60&&x<=86400)),
 proxied:z.boolean().default(false),
 priority:z.number().int().min(0).max(65535).optional()
}).strict();
type Plan=z.infer<typeof planSchema>;
export class DnsError extends Error {
 constructor(public code:string,public status:number=400){super(code);}
}
type DnsRecord={id:string;name:string;type:string;content:string;ttl:number;proxied?:boolean;priority?:number;modified_on?:string};
const label=/^[a-z0-9_*](?:[a-z0-9_*-]{0,61}[a-z0-9_*])?$/i;
function validDomain(s:string){
 const parts=s.split('.');
 return s.length<=253 && parts.length>=2 && parts.every(x=>x.length>0&&x.length<=63&&label.test(x));
}
function normalizeName(value:string,zone:string,type:SupportedType){
 const v=value.trim().toLowerCase().replace(/\.$/,'');
 // Relative names are a single label; nested names must be fully qualified
 // to prevent an accidental out-of-zone name being silently rewritten.
 if(v!==zone && v!=='@' && v.includes('.') && !v.endsWith('.'+zone))
   throw new DnsError('invalid_record_name');
 const name=v==='@'?zone:v===zone||v.endsWith('.'+zone)?v:v+'.'+zone;
 if(!validDomain(name)||!(name===zone||name.endsWith('.'+zone)))throw new DnsError('invalid_record_name');
 if(type!=='TXT'&&type!=='MX'&&name.split('.').some(x=>x.startsWith('_')))
   throw new DnsError('invalid_record_name');
 return name;
}
function normalize(input:unknown,zone:string):Plan{
 const data=planSchema.safeParse(input);
 if(!data.success)throw new DnsError('invalid_dns_record');
 const x=data.data;
 const name=normalizeName(x.name,zone,x.type);
 let content=x.content.trim();
 if(x.type==='A'&&isIP(content)!==4)throw new DnsError('invalid_ipv4_address');
 if(x.type==='AAAA'&&isIP(content)!==6)throw new DnsError('invalid_ipv6_address');
 if(x.type==='CNAME'||x.type==='MX'){
   content=content.toLowerCase().replace(/\.$/,'');
   if(!validDomain(content)||content.includes('_'))throw new DnsError('invalid_dns_target');
 }
 if(x.type==='TXT' && (content.length>2048||/[\u0000-\u001f\u007f]/.test(content)))
   throw new DnsError('invalid_txt_content');
 if(x.type==='MX'&&x.priority===undefined)throw new DnsError('mx_priority_required');
 if(x.type!=='MX'&&x.priority!==undefined)throw new DnsError('unexpected_mx_priority');
 if(!['A','AAAA','CNAME'].includes(x.type)&&x.proxied)throw new DnsError('proxy_not_supported');
 const cleaned={...x,name,content};
 if(!['A','AAAA','CNAME'].includes(x.type))delete (cleaned as Partial<Plan>).proxied;
 return cleaned;
}
function project(record:any):DnsRecord{
 return {id:String(record.id||''),name:String(record.name||''),type:String(record.type||''),
 content:String(record.content||''),ttl:Number(record.ttl)||1,proxied:record.proxied===true,
 ...(Number.isInteger(record.priority)?{priority:record.priority}:{}),
 ...(typeof record.modified_on==='string'?{modified_on:record.modified_on}:{})};
}
export class CloudflareDns {
 private cfg:Stored|null=null;
 constructor(private readonly config:AppConfig,private readonly request:typeof fetch=fetch){
  const file=config.MCP_DNS_PROVIDER_FILE;
  let stat;
  try{stat=lstatSync(file);}catch(err){if((err as NodeJS.ErrnoException).code!=='ENOENT')throw err;}
  if(stat){
   if(!stat.isFile()||(stat.mode&0o077)!==0)throw new Error('Cloudflare credentials must be in a private regular file');
   this.cfg=stored.parse(JSON.parse(readFileSync(file,'utf8')));
  }
 }
 status(){return {configured:!!this.cfg,provider:'cloudflare',zone:this.cfg?.zoneName||'',recordsManaged:!!this.cfg};}
 private active(){
  if(!this.cfg)throw new DnsError('dns_provider_not_connected',409);
  return this.cfg;
 }
 private async call<T>(cfg:Stored,method:string,endpoint:string,payload?:unknown):Promise<T>{
  // All endpoints are constructed by this class from validated 32-hex IDs.
  let response:Response;
  try{
   response=await this.request('https://api.cloudflare.com/client/v4/'+endpoint,{
    method,headers:{Authorization:'Bearer '+cfg.token,'content-type':'application/json',
      Accept:'application/json'},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
    redirect:'error',signal:AbortSignal.timeout(9000)
   });
  }catch{throw new DnsError('dns_provider_unreachable',502);}
  if(Number(response.headers.get('content-length'))>1024*1024)
   throw new DnsError('dns_provider_response_too_large',502);
  let data:any;
  try{
   const content=await response.text();
   if(content.length>1024*1024)throw Error('Oversized response');
   data=JSON.parse(content);
  }catch{throw new DnsError('dns_provider_bad_response',502);}
  if(!response.ok || data?.success!==true){
   if(response.status===401||response.status===403)throw new DnsError('dns_provider_access_denied',403);
   if(response.status===429)throw new DnsError('dns_provider_rate_limited',429);
   throw new DnsError('dns_provider_request_failed',502);
  }
  return data as T;
 }
 async connect(input:unknown){
  const args=z.object({zoneId:zoneIdSchema,token:tokenSchema}).strict().safeParse(input);
  if(!args.success)throw new DnsError('invalid_cloudflare_credentials');
  const proposed:Stored={version:1,zoneId:args.data.zoneId.toLowerCase(),zoneName:'',token:args.data.token};
  const zone=await this.call<{result:{id:string;name:string}}>(proposed,'GET','zones/'+proposed.zoneId);
  if(String(zone.result?.id||'').toLowerCase()!==proposed.zoneId ||
    !validDomain(String(zone.result?.name||'')))throw new DnsError('cloudflare_zone_mismatch',403);
  proposed.zoneName=zone.result.name.toLowerCase();
  // A token must be able to list DNS records before it may be configured.
  await this.call(proposed,'GET','zones/'+proposed.zoneId+'/dns_records?per_page=1&page=1');
  const file=this.config.MCP_DNS_PROVIDER_FILE;
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  try{
   writeFileSync(tmp,JSON.stringify(proposed),{mode:0o600,flag:'wx'});
   renameSync(tmp,file);
   this.cfg=proposed;
  }finally{if(existsSync(tmp))unlinkSync(tmp);}
  return this.status();
 }
 disconnect(){
  if(!this.cfg)return this.status();
  unlinkSync(this.config.MCP_DNS_PROVIDER_FILE);
  this.cfg=null;
  return this.status();
 }
 async list(){
  const cfg=this.active();
  const result:DnsRecord[]=[];
  for(let page=1;page<=10;page++){
   const res=await this.call<{result:any[];result_info?:{total_pages?:number}}>(cfg,'GET',
    'zones/'+cfg.zoneId+'/dns_records?per_page=100&page='+page);
   if(!Array.isArray(res.result))throw new DnsError('dns_provider_bad_response',502);
   result.push(...res.result.map(project));
   if(res.result.length<100||page>=Number(res.result_info?.total_pages||1))break;
  }
  return {zone:cfg.zoneName,records:result,limited:result.length>=1000};
 }
 private async current(id:string){
  const cfg=this.active();
  if(!idSchema.safeParse(id).success)throw new DnsError('invalid_record_id');
  const res=await this.call<{result:any}>(cfg,'GET','zones/'+cfg.zoneId+'/dns_records/'+id);
  const record=project(res.result);
  if(!idSchema.safeParse(record.id).success || !record.name.endsWith('.'+cfg.zoneName)&&record.name!==cfg.zoneName)
   throw new DnsError('dns_record_outside_zone',403);
  return record;
 }
 async create(input:unknown){
  const cfg=this.active();const plan=normalize(input,cfg.zoneName);
  const response=await this.call<{result:any}>(cfg,'POST','zones/'+cfg.zoneId+'/dns_records',plan);
  return project(response.result);
 }
 async update(id:string,input:unknown,expectedContent:unknown){
  const cfg=this.active();const current=await this.current(id);
  if(!TYPES.includes(current.type as SupportedType))throw new DnsError('unsupported_dns_record_type',400);
  if(typeof expectedContent!=='string'||current.content!==expectedContent)throw new DnsError('dns_record_changed_refresh_required',409);
  const plan=normalize(input,cfg.zoneName);
  if(plan.type!==current.type)throw new DnsError('record_type_cannot_change');
  const response=await this.call<{result:any}>(cfg,'PUT','zones/'+cfg.zoneId+'/dns_records/'+id,plan);
  return project(response.result);
 }
 async remove(id:string,confirmName:unknown,confirmType:unknown,expectedContent:unknown){
  const cfg=this.active();const current=await this.current(id);
  if(!TYPES.includes(current.type as SupportedType))throw new DnsError('unsupported_dns_record_type');
  if(confirmName!==current.name||confirmType!==current.type||expectedContent!==current.content)throw new DnsError('dns_record_changed_refresh_required',409);
  await this.call(cfg,'DELETE','zones/'+cfg.zoneId+'/dns_records/'+id);
  return {deleted:true,id};
 }
}
