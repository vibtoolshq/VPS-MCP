import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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
