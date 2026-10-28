import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,statSync,writeFileSync} from 'node:fs';
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
  writeFileSync(file,'{"version":999,"clients":[],"refresh":[]}');
  const config=loadConfig({ADMIN_PASSWORD_HASH:hashPassword('long-test-admin-password-2026'),MCP_STATE_FILE:file});
  assert.throws(()=>new OAuthService(config),/persisted OAuth state/);
});
