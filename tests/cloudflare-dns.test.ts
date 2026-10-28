import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,lstat,readFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import type {AddressInfo} from 'node:net';
import {hashPassword} from '../src/security/authentication.js';
import {loadConfig} from '../src/shared/config.js';
import {CloudflareDns} from '../src/security/cloudflare-dns.js';
import {createHttpServer} from '../src/server/http.js';

const zoneId='a'.repeat(32),zone='example.org',token='cloudflare-test-token-with-32-characters';
const recordId='b'.repeat(32);
const password='Strong-Cloudflare-Test-Password!2026';
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'vpsmcp-cloudflare-'));
 const cfg=loadConfig({ADMIN_PASSWORD_HASH:hashPassword(password),
  MCP_DNS_PROVIDER_FILE:path.join(dir,'dns-provider.json'),
  MCP_AUDIT_FILE:path.join(dir,'audit.jsonl'),
  MCP_STATE_FILE:path.join(dir,'oauth.json'),
  MCP_POLICY_FILE:path.join(dir,'policy.json'),
  MCP_CONTROL_FILE:path.join(dir,'control.json')
 });
 return {cfg,dir};
}
function fakeCloudflare(){
 const requests:{method:string;url:string;body:any;headers:Headers}[]=[];
 const records:any[]=[];
 const mock:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));
  const method=String(init?.method||'GET');
  const headers=new Headers(init?.headers);
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  requests.push({method,url:url.href,body,headers});
  const suffix=url.pathname.replace('/client/v4/','');
  const result=(data:unknown,code=200)=>Response.json({success:code<300,result:data,result_info:{total_pages:1}},{status:code});
  if(headers.get('authorization')!=='Bearer '+token)return result(null,403);
  if(suffix==='zones/'+zoneId && method==='GET')return result({id:zoneId,name:zone,status:'active'});
  if(suffix==='zones/'+zoneId+'/dns_records'){
   if(method==='GET')return result(records);
   if(method==='POST'){
    const item={id:recordId,...body};records.push(item);return result(item);
   }
  }
  if(suffix==='zones/'+zoneId+'/dns_records/'+recordId){
   if(method==='GET')return records.length?result(records[0]):result(null,404);
   if(method==='PUT'){records[0]={id:recordId,...body};return result(records[0]);}
   if(method==='DELETE'){records.length=0;return result({id:recordId});}
  }
  return result(null,404);
 };
 return {mock,requests,records};
}
test('Cloudflare token verifies zone and persists only in private storage, never in status',async()=>{
 const {cfg}=await fixture();
 const f=fakeCloudflare();
 const dns=new CloudflareDns(cfg,f.mock);
 assert.equal(dns.status().configured,false);
 await assert.rejects(dns.connect({zoneId,token:'short'}),/invalid_cloudflare_credentials/);
 const connected=await dns.connect({zoneId,token});
 assert.deepEqual(connected,{configured:true,provider:'cloudflare',zone,recordsManaged:true});
 assert.equal(JSON.stringify(connected).includes(token),false);
 assert.equal((await lstat(cfg.MCP_DNS_PROVIDER_FILE)).mode&0o777,0o600);
 assert.match(await readFile(cfg.MCP_DNS_PROVIDER_FILE,'utf8'),/cloudflare-test-token/);
 assert.equal(new CloudflareDns(cfg,f.mock).status().zone,zone);
 assert.ok(f.requests.every(req=>req.url.startsWith('https://api.cloudflare.com/client/v4/')));
 assert.ok(f.requests.every(req=>req.headers.get('authorization')==='Bearer '+token));
 await dns.disconnect();
 assert.equal(dns.status().configured,false);
 await assert.rejects(readFile(cfg.MCP_DNS_PROVIDER_FILE));
});
test('DNS CRUD validates same-zone names, record types and delete confirmation',async()=>{
 const {cfg}=await fixture(),f=fakeCloudflare(),dns=new CloudflareDns(cfg,f.mock);
 await dns.connect({zoneId,token});
 const record={type:'A',name:'www',content:'203.0.113.10',ttl:300,proxied:false};
 await assert.rejects(dns.create({...record,name:'www.evil.net'}),/invalid_record_name/);
 await assert.rejects(dns.create({...record,content:'bad-ip'}),/invalid_ipv4_address/);
 await assert.rejects(dns.create({...record,type:'CAA'}),/invalid_dns_record/);
 await assert.rejects(dns.create({...record,ttl:2}),/invalid_dns_record/);
 await assert.rejects(dns.create({...record,type:'MX',priority:undefined}),/mx_priority_required/);
 const added=await dns.create(record);
 assert.equal(added.name,'www.example.org');
 assert.equal((await dns.list()).records.length,1);
 await assert.rejects(dns.update('not-a-record-id',record),/invalid_record_id/);
 await assert.rejects(dns.update(recordId,{...record,type:'AAAA'}),/record_type_cannot_change/);
 const edited=await dns.update(recordId,{...record,content:'203.0.113.99'});
 assert.equal(edited.content,'203.0.113.99');
 await assert.rejects(dns.remove(recordId,'bad.example.org','A'),/dns_record_changed_refresh_required/);
 await dns.remove(recordId,'www.example.org','A');
 assert.equal((await dns.list()).records.length,0);
 assert.ok(f.requests.some(x=>x.method==='DELETE'));
});
test('Provider credentials file rejects symlinks even when target does not exist',async()=>{
 const {cfg,dir}=await fixture();
 await symlink(path.join(dir,'target'),cfg.MCP_DNS_PROVIDER_FILE);
 assert.throws(()=>new CloudflareDns(cfg),/private regular file/);
});
test('Admin API enforces auth, CSRF, provider connect and record CRUD without token disclosure',async()=>{
 const {cfg}=await fixture(),f=fakeCloudflare();
 const app=createHttpServer(cfg,f.mock);
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+(app.server.address() as AddressInfo).port;
 const api=(route:string,data:unknown,cookie='',csrf='')=>fetch(url+route,{
  method:'POST',headers:{'content-type':'application/json',cookie,'x-csrf-token':csrf},
  body:JSON.stringify(data)});
 try{
  assert.equal((await fetch(url+'/api/dns/records')).status,401);
  assert.equal((await api('/api/dns/connect',{zoneId,token})).status,401);
  const login=await api('/api/login',{username:'admin',password});
  assert.equal(login.status,200);
  const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
  const {csrf}=await login.json() as {csrf:string};
  assert.equal((await api('/api/dns/connect',{zoneId,token},cookie,'wrong')).status,403);
  const connected=await api('/api/dns/connect',{zoneId,token},cookie,csrf);
  assert.equal(connected.status,200);
  assert.equal(JSON.stringify(await connected.json()).includes(token),false);
  const status=await fetch(url+'/api/status',{headers:{cookie}});
  assert.equal(JSON.stringify(await status.json()).includes(token),false);
  const record={type:'TXT',name:'_dmarc',content:'v=DMARC1; p=none',ttl:300,proxied:false};
  assert.equal((await api('/api/dns/record',{action:'create',record},cookie,csrf)).status,200);
  const list=await fetch(url+'/api/dns/records',{headers:{cookie}});
  const res=await list.json() as {records:{name:string}[]};
  assert.equal(res.records[0]?.name,'_dmarc.example.org');
  assert.equal((await api('/api/dns/record',{action:'delete',id:recordId,confirmName:'wrong.example.org',confirmType:'TXT'},cookie,csrf)).status,409);
  assert.equal((await api('/api/dns/record',{action:'delete',id:recordId,confirmName:'_dmarc.example.org',confirmType:'TXT'},cookie,csrf)).status,200);
  assert.equal((await api('/api/dns/disconnect',{},cookie,csrf)).status,200);
  assert.equal((await fetch(url+'/api/dns/records',{headers:{cookie}})).status,409);
 }finally{await app.shutdown();}
});
