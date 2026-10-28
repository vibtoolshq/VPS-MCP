import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/shared/config.js';
import { hashPassword, verifyPassword } from '../src/security/authentication.js';
import { systemStatus, diskUsage } from '../src/tools/system.js';

const ADMIN_PASSWORD_HASH=hashPassword('Correct Horse Strong Example 2026');

test('local-only defaults require admin password verification',()=>{
  const cfg=loadConfig({ADMIN_PASSWORD_HASH});
  assert.equal(cfg.MCP_HOST,'127.0.0.1');
  assert.equal(cfg.origin,'http://127.0.0.1:3000');
  assert.deepEqual(cfg.allowedTools,['system_status','disk_usage']);
  // New installations deliberately load without an admin hash; AdminSetup blocks all access until setup.
  assert.equal(loadConfig({}).ADMIN_PASSWORD_HASH,'');
  assert.throws(()=>loadConfig({ADMIN_PASSWORD_HASH,MCP_HOST:'0.0.0.0'}));
  assert.throws(()=>loadConfig({ADMIN_PASSWORD_HASH,MCP_PORT:'70000'}));
  assert.throws(()=>loadConfig({ADMIN_PASSWORD_HASH,MCP_ALLOWED_TOOLS:'docker_exec'}));
});

test('remote access refuses cleartext or unpaired TLS',()=>{
  assert.throws(()=>loadConfig({ADMIN_PASSWORD_HASH,MCP_HOST:'0.0.0.0',MCP_PUBLIC_URL:'http://example.com'}));
  assert.throws(()=>loadConfig({ADMIN_PASSWORD_HASH,MCP_HOST:'0.0.0.0',MCP_PUBLIC_URL:'https://mcp.example.com',MCP_TLS_CERT_FILE:'x'}));
  const cfg=loadConfig({
    ADMIN_PASSWORD_HASH,MCP_HOST:'0.0.0.0',
    MCP_PUBLIC_URL:'https://mcp.example.com',
    MCP_TLS_CERT_FILE:'cert.pem',MCP_TLS_KEY_FILE:'key.pem',
    OAUTH_ALLOWED_REDIRECT_URIS:'https://chatgpt.com/connector_platform_oauth_redirect'
  });
  assert.ok(cfg.secureCookies);
  assert.equal(cfg.redirectUris.length,1);
  assert.throws(()=>loadConfig({ADMIN_PASSWORD_HASH,OAUTH_ALLOWED_REDIRECT_URIS:'https://evil.com/path#fragment'}));
});

test('scrypt login verifier rejects wrong password',()=>{
  assert.ok(verifyPassword('Correct Horse Strong Example 2026',ADMIN_PASSWORD_HASH));
  assert.equal(verifyPassword('something else',ADMIN_PASSWORD_HASH),false);
  assert.throws(()=>hashPassword('short'));
});

test('system diagnostics remain read-only',async()=>{
  const system=systemStatus();
  assert.ok(system.cpuCount>=1);
  assert.ok(system.totalMemoryBytes>0);
  const disk=await diskUsage('/');
  assert.match(disk.totalBytes,/^\d+$/);
});

test('private container flag cannot silently allow a publicly-addressable origin',()=>{
 const hash=ADMIN_PASSWORD_HASH;
 const privateConfig={ADMIN_PASSWORD_HASH:hash,MCP_PRIVATE_CONTAINER:'true',MCP_HOST:'0.0.0.0',MCP_PUBLIC_URL:'http://127.0.0.1:3000'};
 assert.equal(loadConfig(privateConfig).origin,'http://127.0.0.1:3000');
 assert.throws(()=>loadConfig({...privateConfig,MCP_PUBLIC_URL:'https://example.net'}),/Private container mode/);
 assert.throws(()=>loadConfig({...privateConfig,MCP_HOST:'127.0.0.1'}),/Private container mode/);
});
