import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,stat,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {type AddressInfo} from 'node:net';
import {loadConfig} from '../src/shared/config.js';
import {createHttpServer} from '../src/server/http.js';

test('private container config allows loopback origin with internal bind, but public plaintext is denied',()=>{
 const token=randomBytes(32).toString('hex');
 const base={MCP_HOST:'0.0.0.0',MCP_PORT:'3000',MCP_SETUP_TOKEN_HASH:createHash('sha256').update(token).digest('hex')};
 assert.throws(()=>loadConfig({...base,MCP_PUBLIC_URL:'http://127.0.0.1:3000'}));
 assert.throws(()=>loadConfig({...base,MCP_PRIVATE_CONTAINER:'true',MCP_PUBLIC_URL:'http://example.com'}));
 assert.equal(loadConfig({...base,MCP_PRIVATE_CONTAINER:'true',MCP_PUBLIC_URL:'http://127.0.0.1:3000'}).origin,'http://127.0.0.1:3000');
});

test('first installation denies login and MCP until authenticated one-time admin setup',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'vpsmcp-setup-'));
 const token=randomBytes(32).toString('hex');
 const cfg=loadConfig({
  MCP_SETUP_TOKEN_HASH:createHash('sha256').update(token).digest('hex'),
  MCP_ADMIN_STATE_FILE:path.join(dir,'admin.json'),
  MCP_CONTROL_FILE:path.join(dir,'control.json'),
  MCP_STATE_FILE:path.join(dir,'oauth.json'),
  MCP_POLICY_FILE:path.join(dir,'policy.json'),
  MCP_AUDIT_FILE:path.join(dir,'audit.jsonl')
 });
 const app=createHttpServer(cfg);
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+(app.server.address() as AddressInfo).port;
 const post=(route:string,data:unknown)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 try{
  assert.deepEqual(await (await fetch(base+'/api/setup/status')).json(),{required:true,username:'admin'});
  assert.equal((await post('/api/login',{username:'admin',password:'Pass@123'})).status,503);
  assert.equal((await post('/api/setup',{token:'wrong',username:'admin',password:'My-Unique-Passphrase#2026',confirm:'My-Unique-Passphrase#2026'})).status,403);
  assert.equal((await post('/api/setup',{token,username:'admin',password:'Pass@123',confirm:'Pass@123'})).status,403);
  assert.equal((await post('/api/setup',{token,username:'admin',password:'My-Unique-Passphrase#2026',confirm:'My-Unique-Passphrase#2026'})).status,200);
  assert.equal((await post('/api/setup',{token,username:'newadmin',password:'Other-Unique-Passphrase#2026',confirm:'Other-Unique-Passphrase#2026'})).status,409);
  assert.equal((await post('/api/login',{username:'admin',password:'Pass@123'})).status,401);
  assert.equal((await post('/api/login',{username:'admin',password:'My-Unique-Passphrase#2026'})).status,200);
  assert.deepEqual(await (await fetch(base+'/api/setup/status')).json(),{required:false});
  const stored=await readFile(cfg.MCP_ADMIN_STATE_FILE,'utf8');
  assert.equal(stored.includes('My-Unique-Passphrase#2026'),false);
  assert.equal((await stat(cfg.MCP_ADMIN_STATE_FILE)).mode&0o777,0o600);
 }finally{await app.shutdown();}
 const restarted=createHttpServer(cfg);
 try{assert.equal(restarted.oauth.stats().clients,0);}finally{await restarted.shutdown().catch(()=>undefined);}
});

test('configuration with no pre-existing admin hash or setup token fails closed',()=>{
 assert.throws(()=>createHttpServer(loadConfig({})),/installer-generated setup token hash/);
});

test('deleting admin credentials after setup does not reopen the bootstrap endpoint',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'vpsmcp-state-loss-'));
 const token=randomBytes(32).toString('hex');
 const cfg=loadConfig({
   MCP_SETUP_TOKEN_HASH:createHash('sha256').update(token).digest('hex'),
   MCP_ADMIN_STATE_FILE:path.join(dir,'admin.json'),
   MCP_CONTROL_FILE:path.join(dir,'control.json'),
   MCP_STATE_FILE:path.join(dir,'oauth.json'),
   MCP_POLICY_FILE:path.join(dir,'policy.json'),
   MCP_AUDIT_FILE:path.join(dir,'audit.jsonl')
 });
 const first=createHttpServer(cfg);
 await new Promise<void>(resolve=>first.server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+(first.server.address() as AddressInfo).port;
  const result=await fetch(base+'/api/setup',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({token,username:'admin',password:'UniqueSecurePassphrase#2026!',
      confirm:'UniqueSecurePassphrase#2026!'})
  });
  assert.equal(result.status,200);
 }finally{await first.shutdown();}
 assert.equal((await stat(cfg.MCP_ADMIN_STATE_FILE+'.complete')).mode&0o777,0o600);
 await (await import('node:fs/promises')).unlink(cfg.MCP_ADMIN_STATE_FILE);
 assert.throws(()=>createHttpServer(cfg),/Previously initialized admin state is missing/);
});
