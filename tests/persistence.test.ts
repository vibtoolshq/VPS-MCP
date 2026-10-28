import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,statSync,writeFileSync,renameSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig} from '../src/shared/config.js';
import {hashPassword} from '../src/security/authentication.js';
import {OAuthService} from '../src/security/oauth.js';

test('OAuth client registrations persist securely across re-instantiation',()=>{
  const file=join(tmpdir(),'vps-mcp-state-'+randomUUID()+'.json');
  const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  const config=loadConfig({
    ADMIN_PASSWORD_HASH:hashPassword('long-test-admin-password-2026'),
    MCP_STATE_FILE:file,
    OAUTH_ALLOWED_REDIRECT_URIS:redirect
  });
  const first=new OAuthService(config);
  first.setEnrollment(true);
  const registered=first.register({client_name:'Test Connector',redirect_uris:[redirect]});
  assert.match(registered.client_id,/^vpsmcp_/);
  assert.equal(first.stats().clients,1);
  assert.equal(statSync(file).mode & 0o777,0o600);
  const saved=readFileSync(file,'utf8');
  assert.equal(saved.includes('ADMIN_PASSWORD_HASH'),false);
  const restarted=new OAuthService(config);
  assert.equal(restarted.stats().clients,1);
});

test('corrupt OAuth persistence refuses to start rather than silently resetting',()=>{
  const file=join(tmpdir(),'vps-mcp-corrupt-'+randomUUID()+'.json');
  writeFileSync(file,'{"version":999,"clients":[],"refresh":[]}',{mode:0o600});
  const config=loadConfig({ADMIN_PASSWORD_HASH:hashPassword('long-test-admin-password-2026'),MCP_STATE_FILE:file});
  assert.throws(()=>new OAuthService(config),/persisted OAuth state/);
});

test('failed revocation persistence cannot silently revoke in RAM and resurrect on restart',()=>{
  const file=join(tmpdir(),'vpsmcp-revoke-'+randomUUID()+'.json');
  const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  const cfg=loadConfig({ADMIN_PASSWORD_HASH:hashPassword('long-test-admin-password-2026'),
    MCP_STATE_FILE:file,OAUTH_ALLOWED_REDIRECT_URIS:redirect});
  const oauth=new OAuthService(cfg);
  oauth.setEnrollment(true);
  const client=oauth.register({redirect_uris:[redirect]});
  const original=readFileSync(file,'utf8');
  // An occupied directory at destination makes atomic rename fail.
  renameSync(file,file+'.backup');
  mkdirSync(file);
  assert.throws(()=>oauth.revokeClient(client.client_id));
  assert.equal(oauth.hasClient(client.client_id),true);
  rmSync(file,{recursive:true});
  renameSync(file+'.backup',file);
  assert.equal(new OAuthService(cfg).hasClient(client.client_id),true);
  assert.equal(readFileSync(file,'utf8'),original);
});

test('registration does not appear in memory when local state persistence fails',()=>{
  const file=join(tmpdir(),'vpsmcp-register-failure-'+randomUUID()+'.json');
  const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  const config=loadConfig({ADMIN_PASSWORD_HASH:hashPassword('long-test-admin-password-2026'),
    MCP_STATE_FILE:file,OAUTH_ALLOWED_REDIRECT_URIS:redirect});
  const svc=new OAuthService(config);
  svc.setEnrollment(true);
  mkdirSync(file);
  assert.throws(()=>svc.register({redirect_uris:[redirect]}));
  assert.equal(svc.stats().clients,0);
  rmSync(file,{recursive:true});
  assert.equal(svc.stats().clients,0);
  assert.match(svc.register({redirect_uris:[redirect]}).client_id,/^vpsmcp_/);
});
test('failed code exchange leaves no hidden access tokens; refresh token survives a failed disk write',()=>{
  const file=join(tmpdir(),'vpsmcp-issue-failure-'+randomUUID()+'.json');
  const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
  const config=loadConfig({ADMIN_PASSWORD_HASH:hashPassword('long-test-admin-password-2026'),
    MCP_STATE_FILE:file,OAUTH_ALLOWED_REDIRECT_URIS:redirect});
  const svc=new OAuthService(config);
  svc.setEnrollment(true);
  const client=svc.register({redirect_uris:[redirect]});
  const verifier='a_test_verifier_abcdefghijklmnopqrstuvwxyz0123456789';
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  function authorizationCode(){
    const pending=svc.begin(new URLSearchParams({
      response_type:'code',client_id:client.client_id,redirect_uri:redirect,
      code_challenge:challenge,code_challenge_method:'S256',scope:'vps:read'
    }));
    return new URL(svc.decide(pending.id,true)).searchParams.get('code')||'';
  }
  function exchange(code:string){
    return svc.token(new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,
      redirect_uri:redirect,code,code_verifier:verifier})) as {access_token:string;refresh_token:string};
  }
  const doomed=authorizationCode();
  renameSync(file,file+'.backup');
  mkdirSync(file);
  assert.throws(()=>exchange(doomed));
  assert.equal(svc.stats().activeTokens,0);
  rmSync(file,{recursive:true});
  renameSync(file+'.backup',file);
  assert.equal(new OAuthService(config).stats().clients,1);
  const good=exchange(authorizationCode());
  assert.equal(svc.stats().activeTokens,1);
  renameSync(file,file+'.backup');
  mkdirSync(file);
  const refresh=()=>svc.token(new URLSearchParams({grant_type:'refresh_token',
    client_id:client.client_id,refresh_token:good.refresh_token}));
  assert.throws(refresh);
  assert.equal(svc.stats().activeTokens,1);
  rmSync(file,{recursive:true});
  renameSync(file+'.backup',file);
  const rotated=refresh() as {refresh_token:string};
  assert.ok(rotated.refresh_token);
  assert.notEqual(rotated.refresh_token,good.refresh_token);
  assert.throws(refresh,/invalid_grant/);
  assert.equal(new OAuthService(config).stats().clients,1);
});
