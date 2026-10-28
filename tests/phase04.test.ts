import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {loadConfig} from '../src/shared/config.js';
import {hashPassword} from '../src/security/authentication.js';
import {workspaceList,workspaceRead,workspaceCreate} from '../src/tools/filesystem.js';
import {startBroker} from '../src/broker/server.js';
import {brokerCall} from '../src/broker/client.js';
import {ApprovalQueue} from '../src/security/approvals.js';
import {createHttpServer} from '../src/server/http.js';

const password='strong-phase04-ci-password';
const secret='broker-ci-secret-long-random-string-1234567890';
const callback='http://127.0.0.1:3999/callback';
async function fixture(){
  const dir=await mkdtemp(path.join(tmpdir(),'vpsmcp04-'));
  const config=loadConfig({
    ADMIN_PASSWORD_HASH:hashPassword(password),
    OAUTH_ALLOWED_REDIRECT_URIS:callback,
    MCP_ALLOWED_TOOLS:'system_status,disk_usage,workspace_list,workspace_read,docker_status,deployment_status,operation_request,operation_execute',
    MCP_ENABLE_WRITES:'true',MCP_READ_ROOT:dir,MCP_WRITE_ROOT:dir,
    MCP_BROKER_SOCKET:path.join(dir,'broker.sock'),MCP_BROKER_SECRET:secret,
    MCP_AUDIT_FILE:path.join(dir,'audit.jsonl'),MCP_STATE_FILE:path.join(dir,'state.json'),
    MCP_CONTROL_FILE:path.join(dir,'control.json')
  });
  return {config,dir};
}
test('paths reject traversal, hidden files, symlinks and overwrites',async()=>{
  const {dir}=await fixture();
  await workspaceCreate(dir,'hello.txt','hello');
  assert.equal((await workspaceRead(dir,'hello.txt')).content,'hello');
  assert.equal((await workspaceList(dir)).entries.some(x=>x.name==='hello.txt'),true);
  await assert.rejects(workspaceRead(dir,'../etc/passwd'));
  await assert.rejects(workspaceRead(dir,'.env'));
  await assert.rejects(workspaceCreate(dir,'hello.txt','overwrite'));
  await assert.rejects(workspaceCreate(dir,'../escape','nope'));
  await symlink('/etc/passwd',path.join(dir,'link.txt'));
  await assert.rejects(workspaceRead(dir,'link.txt'));
  await assert.rejects(workspaceCreate(dir,'link.txt','nope'));
  await writeFile(path.join(dir,'.secret'),'hidden');
  assert.equal((await workspaceList(dir)).entries.some(x=>x.name==='.secret'),false);
});

test('separate broker: token authentication, file.create, disabled commands',async()=>{
  const {config,dir}=await fixture();
  const broker=await startBroker(config);
  try{
    assert.equal((await brokerCall(config,{type:'file.create',path:'new.txt',content:'small'} ) as {created:string}).created,'new.txt');
    assert.equal(await readFile(path.join(dir,'new.txt'),'utf8'),'small');
    await assert.rejects(brokerCall({...config,MCP_BROKER_SECRET:'invalid-secret-long-1234567890-xxxx'},{
      type:'file.create',path:'bad.txt',content:'bad'
    }),/denied/i);
    await assert.rejects(brokerCall(config,{type:'file.create',path:'new.txt',content:'overwrite'}));
    await assert.rejects(brokerCall(config,{type:'docker.restart',container:'not_allowed'}));
    await assert.rejects(brokerCall(config,{type:'deploy.sync'}));
    await assert.rejects(brokerCall(config,{type:'deploy.status'}));
  }finally{await broker.stop();}
});

test('one-time approval must match client identity and cannot replay',async()=>{
  const queue=new ApprovalQueue();
  const created=queue.propose('clientA',{type:'file.create',path:'approved.txt',content:'approved'});
  assert.equal(queue.pending().length,1);
  await assert.rejects(queue.execute(created.approvalId,'clientA',async()=>({ok:true})));
  queue.decide(created.approvalId,true,'admin');
  await assert.rejects(queue.execute(created.approvalId,'clientB',async()=>({ok:true})));
  assert.deepEqual(await queue.execute(created.approvalId,'clientA',async()=>({ok:true})),{ok:true});
  await assert.rejects(queue.execute(created.approvalId,'clientA',async()=>({ok:true})));
  assert.throws(()=>queue.decide(created.approvalId,true,'admin'));
  assert.throws(()=>queue.propose('clientA',{type:'arbitrary.shell',cmd:'rm -rf /'}));
});

async function exchange(base:string,scope:string){
  const enrollmentLogin=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'admin',password})});
  assert.equal(enrollmentLogin.status,200);
  const enrollmentCookie=(enrollmentLogin.headers.get('set-cookie')||'').split(';')[0];
  const enrollmentCsrf=(await enrollmentLogin.json() as {csrf:string}).csrf;
  const enrollment=await fetch(base+'/api/enrollment',{method:'POST',headers:{
    cookie:enrollmentCookie,'x-csrf-token':enrollmentCsrf,'content-type':'application/json'
  },body:JSON.stringify({enabled:true})});
  assert.equal(enrollment.status,200);
  const registered=await fetch(base+'/oauth/register',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({client_name:'CI',redirect_uris:[callback]})});
  assert.equal(registered.status,201);
  const {client_id}=await registered.json() as {client_id:string};
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'admin',password})});
  assert.equal(login.status,200);
  const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
  const {csrf}=await login.json() as {csrf:string};
  const verifier='test_verifier_12345678901234567890123456789012345678';
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const q=new URLSearchParams({client_id,redirect_uri:callback,response_type:'code',scope,
    code_challenge:challenge,code_challenge_method:'S256',resource:'http://127.0.0.1:3000/mcp'});
  const auth=await fetch(base+'/oauth/authorize?'+q,{headers:{cookie}});
  assert.equal(auth.status,200);
  const id=(await auth.text()).match(/name="id" value="([^"]+)"/)?.[1];
  assert.ok(id);
  const approval=await fetch(base+'/oauth/approve',{method:'POST',redirect:'manual',
    headers:{cookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({id,csrf,decision:'allow'})});
  assert.equal(approval.status,302);
  const code=new URL(approval.headers.get('location')||'').searchParams.get('code');
  assert.ok(code);
  const token=await fetch(base+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'authorization_code',client_id,redirect_uri:callback,code,code_verifier:verifier})});
  assert.equal(token.status,200);
  const {access_token}=await token.json() as {access_token:string};
  return {access_token,csrf,cookie,client_id};
}
test('MCP write flow needs OAuth vps:write + panel CSRF approval + single-use broker call',async()=>{
  const {config,dir}=await fixture();
  const broker=await startBroker(config);
  const app=createHttpServer(config);
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+(app.server.address() as AddressInfo).port;
  try{
    const {access_token,csrf,cookie}=await exchange(base,'vps:read vps:write');
    const client=new Client({name:'phase04-test',version:'1.0.0'});
    await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{
      requestInit:{headers:{authorization:'Bearer '+access_token}}
    }));
    try{
      const tools=await client.listTools();
      assert.ok(tools.tools.some(t=>t.name==='operation_request'));
      assert.ok(tools.tools.some(t=>t.name==='workspace_read'));
      const proposed=await client.callTool({name:'operation_request',arguments:{
        operation:{type:'file.create',path:'from-mcp.txt',content:'approved write'}
      }});
      assert.notEqual(proposed.isError,true);
      const content=proposed.content as {text?:string}[];
      const {approvalId}=JSON.parse(content[0]!.text||'{}') as {approvalId:string};
      assert.ok(approvalId);
      const unapproved=await client.callTool({name:'operation_execute',arguments:{approvalId}});
      assert.equal(unapproved.isError,true);
      const status=await fetch(base+'/api/status',{headers:{cookie}});
      const state=await status.json() as {pendingApprovals:{id:string}[]};
      assert.equal(state.pendingApprovals[0]?.id,approvalId);
      const bad=await fetch(base+'/api/approval',{method:'POST',headers:{cookie,'content-type':'application/json'},
        body:JSON.stringify({id:approvalId,approve:true})});
      assert.equal(bad.status,403);
      const good=await fetch(base+'/api/approval',{method:'POST',headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},
        body:JSON.stringify({id:approvalId,approve:true})});
      assert.equal(good.status,200);
      const executed=await client.callTool({name:'operation_execute',arguments:{approvalId}});
      assert.notEqual(executed.isError,true);
      assert.equal(await readFile(path.join(dir,'from-mcp.txt'),'utf8'),'approved write');
      const replay=await client.callTool({name:'operation_execute',arguments:{approvalId}});
      assert.equal(replay.isError,true);
    }finally{await client.close();}
    const reader=await exchange(base,'vps:read');
    const readClient=new Client({name:'read-client',version:'1.0.0'});
    await readClient.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{
      requestInit:{headers:{authorization:'Bearer '+reader.access_token}}
    }));
    try{
      const denied=await readClient.callTool({name:'operation_request',arguments:{
        operation:{type:'file.create',path:'denied.txt',content:'no'}
      }});
      assert.equal(denied.isError,true);
    }finally{await readClient.close();}
  }finally{await app.shutdown();await broker.stop();}
});
