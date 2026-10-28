import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,chmod,stat,symlink,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import type {AddressInfo} from 'node:net';
import {hashPassword} from '../src/security/authentication.js';
import {loadConfig} from '../src/shared/config.js';
import {NetworkSettings} from '../src/security/network.js';
import {createHttpServer} from '../src/server/http.js';
const password='Network-Admin-Password-2026!';
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'vpsmcp-network-'));
 const cfg=loadConfig({ADMIN_PASSWORD_HASH:hashPassword(password),
  MCP_NETWORK_DRAFT_FILE:path.join(dir,'network-draft.json'),
  MCP_AUDIT_FILE:path.join(dir,'audit.jsonl'),MCP_STATE_FILE:path.join(dir,'oauth.json'),
  MCP_POLICY_FILE:path.join(dir,'policy.json'),MCP_CONTROL_FILE:path.join(dir,'control.json'),
  MCP_BIND_PORT:'3000'});
 return {dir,cfg};
}
test('network plan validates domain, TLS mode and private host port; draft does not modify active server',async()=>{
 const {cfg}=await fixture();
 const network=new NetworkSettings(cfg);
 assert.equal(network.snapshot().applied.hostPort,3000);
 assert.equal(network.snapshot().draft.domain,'');
 assert.throws(()=>network.save({domain:'https://evil.example.com/path',hostPort:3333,sslMode:'external-https'}));
 assert.throws(()=>network.save({domain:'localhost',hostPort:3333,sslMode:'external-https'}));
 assert.throws(()=>network.save({domain:'mcp.example.com',hostPort:22,sslMode:'external-https'}));
 assert.throws(()=>network.save({domain:'',hostPort:3333,sslMode:'external-https'}));
 assert.throws(()=>network.save({domain:'mcp.example.com',hostPort:3333,sslMode:'unknown'}));
 network.save({domain:'MCP.EXAMPLE.COM',hostPort:3333,sslMode:'external-https'});
 assert.equal(network.snapshot().draft.domain,'mcp.example.com');
 assert.equal(network.snapshot().draft.hostPort,3333);
 assert.equal(network.snapshot().applied.hostPort,3000);
 assert.equal(network.snapshot().domainConfigured,false);
 assert.equal(network.snapshot().sslCertificateManaged,false);
 assert.equal((await stat(cfg.MCP_NETWORK_DRAFT_FILE)).mode&0o777,0o600);
 assert.equal(new NetworkSettings(cfg).snapshot().draft.hostPort,3333);
});
test('network draft rejects insecure preexisting storage and default DNS does not query remotely',async()=>{
 const {cfg,dir}=await fixture();
 const network=new NetworkSettings(cfg);
 assert.equal((await network.dnsCheck()).state,'not-configured');
 await symlink(path.join(dir,'other'),cfg.MCP_NETWORK_DRAFT_FILE);
 assert.throws(()=>new NetworkSettings(cfg),/private/);
});
test('network API requires admin session and CSRF, persists draft and does not enable HTTPS',async()=>{
 const {cfg}=await fixture();
 const app=createHttpServer(cfg);
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+(app.server.address() as AddressInfo).port;
 const post=(cookie:string,csrf:string,data:unknown)=>fetch(base+'/api/network/plan',{
  method:'POST',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},
  body:JSON.stringify(data)});
 try{
  assert.equal((await post('','',{})).status,401);
  assert.equal((await fetch(base+'/api/network/dns')).status,401);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({username:'admin',password})});
  assert.equal(login.status,200);
  const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
  const {csrf}=await login.json() as {csrf:string};
  const plan={domain:'mcp.example.com',hostPort:3333,sslMode:'external-https'};
  assert.equal((await post(cookie,'invalid',plan)).status,403);
  assert.equal((await post(cookie,csrf,{...plan,hostPort:22})).status,400);
  const staged=await post(cookie,csrf,plan);
  assert.equal(staged.status,200);
  const stored=await staged.json() as {network:{draft:{hostPort:number},applied:{hostPort:number,ssl:string}}};
  assert.equal(stored.network.draft.hostPort,3333);
  assert.equal(stored.network.applied.hostPort,3000);
  assert.equal(stored.network.applied.ssl,'not-configured');
  const status=await fetch(base+'/api/status',{headers:{cookie}});
  assert.equal((await status.json() as {network:{draft:{domain:string}}}).network.draft.domain,'mcp.example.com');
 }finally{await app.shutdown();}
});

test('network change fails closed when a durable audit record cannot be written',async()=>{
 const {cfg}=await fixture();
 await mkdir(cfg.MCP_AUDIT_FILE);
 const app=createHttpServer(cfg);
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+(app.server.address() as AddressInfo).port;
 try{
  const login=await fetch(base+'/api/login',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password})});
  assert.equal(login.status,200);
  const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
  const {csrf}=await login.json() as {csrf:string};
  const changed=await fetch(base+'/api/network/plan',{method:'POST',
   headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},
   body:JSON.stringify({domain:'mcp.example.org',hostPort:4400,sslMode:'private-only'})});
  assert.equal(changed.status,400);
  await assert.rejects(access(cfg.MCP_NETWORK_DRAFT_FILE));
 }finally{await app.shutdown();}
});
