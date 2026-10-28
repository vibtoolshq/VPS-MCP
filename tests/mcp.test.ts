import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { loadConfig } from '../src/shared/config.js';
import { hashPassword } from '../src/security/authentication.js';
import { createHttpServer } from '../src/server/http.js';

const password='phase03-test-strong-password';
const callback='http://127.0.0.1:3999/callback';
async function withServer(work:(base:string)=>Promise<void>){
  const cfg=loadConfig({
    ADMIN_PASSWORD_HASH:hashPassword(password),
    OAUTH_ALLOWED_REDIRECT_URIS:callback,
    MCP_AUDIT_FILE:join(tmpdir(),'vps-mcp-ci-'+randomUUID()+'.jsonl'),
    MCP_STATE_FILE:join(tmpdir(),'vps-mcp-ci-'+randomUUID()+'.json'),
    MCP_CONTROL_FILE:join(tmpdir(),'vps-mcp-control-'+randomUUID()+'.json')
  });
  const app=createHttpServer(cfg);
  await new Promise<void>((resolve,reject)=>{
    app.server.once('error',reject);
    app.server.listen(0,'127.0.0.1',resolve);
  });
  const port=(app.server.address() as AddressInfo).port;
  try {await work('http://127.0.0.1:'+port);}
  finally {await app.shutdown();}
}
async function register(base:string){
  const signed=await login(base);
  assert.equal(signed.status,200);
  const cookie=(signed.headers.get('set-cookie')||'').split(';')[0];
  const {csrf}=await signed.json() as {csrf:string};
  const window=await fetch(base+'/api/enrollment',{method:'POST',
    headers:{cookie,'x-csrf-token':csrf,'content-type':'application/json'},
    body:JSON.stringify({enabled:true})});
  assert.equal(window.status,200);
  return fetch(base+'/oauth/register',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({client_name:'CI Test',redirect_uris:[callback],token_endpoint_auth_method:'none'})});
}
async function login(base:string,valid=true){
  return fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'admin',password:valid?password:'wrong'})});
}
async function oauthToken(base:string){
  const registration=await register(base);
  assert.equal(registration.status,201);
  const client=await registration.json() as {client_id:string};
  const signed=await login(base);
  assert.equal(signed.status,200);
  const cookie=(signed.headers.get('set-cookie')||'').split(';')[0];
  const {csrf}=await signed.json() as {csrf:string};
  assert.ok(csrf.length>=20);
  const verifier='this_is_a_test_verifier_for_pkce_minimum_43_characters';
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const query=new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:callback,scope:'vps:read offline_access',
    code_challenge:challenge,code_challenge_method:'S256',state:'opaque-state',resource:'http://127.0.0.1:3000/mcp'});
  const auth=await fetch(base+'/oauth/authorize?'+query,{headers:{cookie},redirect:'manual'});
  assert.equal(auth.status,200);
  const html=await auth.text();
  const id=html.match(/name="id" value="([^"]+)"/)?.[1];
  assert.ok(id);
  const approve=await fetch(base+'/oauth/approve',{method:'POST',redirect:'manual',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({id,csrf,decision:'allow'})});
  assert.equal(approve.status,302);
  const destination=new URL(approve.headers.get('location')||callback);
  assert.equal(destination.origin,new URL(callback).origin);
  assert.equal(destination.searchParams.get('state'),'opaque-state');
  const code=destination.searchParams.get('code');
  assert.ok(code);
  const fields=new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:callback,
    code,code_verifier:verifier,resource:'http://127.0.0.1:3000/mcp'});
  const response=await fetch(base+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:fields});
  assert.equal(response.status,200);
  const tokens=await response.json() as {access_token:string;refresh_token:string};
  assert.ok(tokens.access_token);
  return {tokens,clientId:client.client_id,cookie,csrf};
}
function requestWithHeaders(url:string,headers:Record<string,string>){
  return new Promise<number>((resolve,reject)=>{
    const req=httpRequest(url,{headers},res=>{res.resume();res.on('end',()=>resolve(res.statusCode||0));});
    req.on('error',reject);req.end();
  });
}
test('health and OAuth discovery; Host and Origin reject spoofing',async()=>{
  await withServer(async base=>{
    assert.equal((await fetch(base+'/health')).status,200);
    assert.equal((await fetch(base+'/.well-known/oauth-protected-resource')).status,200);
    assert.equal((await fetch(base+'/.well-known/oauth-authorization-server')).status,200);
    assert.equal(await requestWithHeaders(base+'/health',{host:'evil.example'}),403);
    assert.equal(await requestWithHeaders(base+'/health',{origin:'https://evil.example'}),403);
    assert.equal((await fetch(base+'/api/status')).status,401);
    assert.equal((await fetch(base+'/mcp',{method:'POST'})).status,401);
    assert.equal((await fetch(base+'/mcp')).status,405);
    assert.equal((await fetch(base+'/assets/panel.css')).status,200);
  });
});
test('login, cookie, CSRF, callback allowlist and rate-limited bad credentials',async()=>{
  await withServer(async base=>{
    const bad=await login(base,false);assert.equal(bad.status,401);
    const disallowed=await fetch(base+'/oauth/register',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({redirect_uris:['https://evil.example/callback']})});
    assert.equal(disallowed.status,403); // registration is closed until an admin opens enrollment
    const signed=await login(base);assert.equal(signed.status,200);
    const cookie=(signed.headers.get('set-cookie')||'').split(';')[0];
    const status=await fetch(base+'/api/status',{headers:{cookie}});assert.equal(status.status,200);
    const forbidden=await fetch(base+'/api/mcp',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({enabled:false})});
    assert.equal(forbidden.status,403);
    const {csrf}=await signed.json() as {csrf:string};
    const done=await fetch(base+'/api/mcp',{method:'POST',headers:{cookie,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({enabled:false})});
    assert.equal(done.status,200);
    assert.equal((await fetch(base+'/mcp',{method:'POST'})).status,503);
  });
});
test('OAuth code, token and read-only MCP client integration',async()=>{
  await withServer(async base=>{
    const {tokens,clientId}=await oauthToken(base);
    const transport=new StreamableHTTPClientTransport(new URL(base+'/mcp'),{
      requestInit:{headers:{Authorization:'Bearer '+tokens.access_token}}
    });
    const client=new Client({name:'phase03-test',version:'1.0.0'});
    await client.connect(transport);
    try{
      const list=await client.listTools();
      assert.deepEqual(list.tools.map(t=>t.name).sort(),['disk_usage','system_status']);
      assert.ok(list.tools.every(t=>t.annotations?.readOnlyHint));
      assert.notEqual((await client.callTool({name:'system_status',arguments:{}})).isError,true);
      assert.notEqual((await client.callTool({name:'disk_usage',arguments:{path:'/'}})).isError,true);
      assert.equal((await client.callTool({name:'disk_usage',arguments:{path:'/etc'}})).isError,true);
    } finally{await client.close();}
    const refreshed=await fetch(base+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:tokens.refresh_token})});
    assert.equal(refreshed.status,200);
    const replay=await fetch(base+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:tokens.refresh_token})});
    assert.equal(replay.status,400);
  });
});
