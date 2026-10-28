import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/security/authentication.js';
import { loadConfig } from '../src/shared/config.js';
import { OAuthService } from '../src/security/oauth.js';
import { AuditLog } from '../src/security/audit.js';
import { ApprovalQueue } from '../src/security/approvals.js';
import { loadMcpEnabled, persistMcpEnabled } from '../src/security/control.js';

const hash=hashPassword('forensic-tests-admin-password-strong');
async function fixture() {
  const dir=await mkdtemp(path.join(tmpdir(),'vpsmcp-forensic-'));
  const callback='https://chatgpt.com/connector_platform_oauth_redirect';
  const config=loadConfig({
    ADMIN_PASSWORD_HASH:hash,
    OAUTH_ALLOWED_REDIRECT_URIS:callback,
    MCP_STATE_FILE:path.join(dir,'oauth.json'),
    MCP_AUDIT_FILE:path.join(dir,'audit.jsonl'),
    MCP_CONTROL_FILE:path.join(dir,'control.json')
  });
  return {config,dir,callback};
}
test('client enrollment is closed by default, expires and limits slots',async()=>{
  const {config,callback}=await fixture();
  const auth=new OAuthService(config);
  const details={redirect_uris:[callback],client_name:'forensic'};
  assert.throws(()=>auth.register(details),/registration_closed/);
  auth.setEnrollment(true);
  for(let index=0;index<5;index++)auth.register(details);
  assert.throws(()=>auth.register(details),/registration_limit/);
  auth.setEnrollment(false);
  assert.throws(()=>auth.register(details),/registration_closed/);
  const restarted=new OAuthService(config);
  assert.equal(restarted.enrollment(),0);
  assert.equal(restarted.stats().clients,5);
});
test('revoked redirect allowlist cannot reauthorize old persisted client',async()=>{
  const {config,callback}=await fixture();
  const auth=new OAuthService(config);
  auth.setEnrollment(true);
  auth.register({redirect_uris:[callback]});
  const revoked=loadConfig({
    ADMIN_PASSWORD_HASH:hash,MCP_STATE_FILE:config.MCP_STATE_FILE,
    OAUTH_ALLOWED_REDIRECT_URIS:'https://example.org/callback'
  });
  assert.equal(new OAuthService(revoked).stats().clients,0);
});
test('OAuth secrets storage refuses world-readable existing files',async()=>{
  const {config}=await fixture();
  await writeFile(config.MCP_STATE_FILE,JSON.stringify({version:1,clients:[],refresh:[]}),{mode:0o644});
  await chmod(config.MCP_STATE_FILE,0o644);
  assert.throws(()=>new OAuthService(config),/permissions are insecure/);
});
test('MCP disable state persists, malformed files fail closed',async()=>{
  const {config}=await fixture();
  assert.equal(loadMcpEnabled(config.MCP_CONTROL_FILE),true);
  persistMcpEnabled(config.MCP_CONTROL_FILE,false);
  assert.equal(loadMcpEnabled(config.MCP_CONTROL_FILE),false);
  persistMcpEnabled(config.MCP_CONTROL_FILE,true);
  assert.equal(loadMcpEnabled(config.MCP_CONTROL_FILE),true);
  await writeFile(config.MCP_CONTROL_FILE,'broken json',{mode:0o600});
  assert.throws(()=>loadMcpEnabled(config.MCP_CONTROL_FILE));
});
test('audit storage failure prevents broker side effect despite approval',async()=>{
  const {dir}=await fixture();
  const notFile=path.join(dir,'audit-directory');
  await mkdir(notFile);
  const audit=new AuditLog(notFile);
  const approvals=new ApprovalQueue(audit);
  const queued=approvals.propose('clientA',{type:'file.create',path:'sample.txt',content:'text'});
  approvals.decide(queued.approvalId,true,'admin');
  let calls=0;
  await assert.rejects(
    approvals.execute(queued.approvalId,'clientA',async()=>{calls++;return {ok:true};}),
    /Broker operation failed or was denied/
  );
  assert.equal(calls,0);
});
