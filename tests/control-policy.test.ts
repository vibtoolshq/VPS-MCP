import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {PolicyStore} from '../src/security/policy.js';
import {hashPassword} from '../src/security/authentication.js';
import {loadConfig} from '../src/shared/config.js';

async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'vps-policy-'));
 const cfg=loadConfig({
   ADMIN_PASSWORD_HASH:hashPassword('test-password-for-granular-console'),
   MCP_ALLOWED_TOOLS:'system_status,disk_usage,workspace_list,operation_request,operation_execute',
   MCP_ENABLE_WRITES:'true',MCP_READ_ROOT:root,MCP_WRITE_ROOT:root,
   MCP_BROKER_SOCKET:path.join(root,'broker.sock'),MCP_BROKER_SECRET:'test-broker-secret-is-32-chars-minimum!',
   MCP_POLICY_FILE:path.join(root,'policy.json'),
   MCP_STATE_FILE:path.join(root,'oauth.json'),MCP_CONTROL_FILE:path.join(root,'control.json')
 });
 return {root,cfg};
}
test('global tool toggles persist and cannot grant outside the env allowlist',async()=>{
 const {cfg}=await fixture();
 const policy=new PolicyStore(cfg);
 assert.ok(policy.toolAllowed('system_status'));
 policy.setTool('system_status',false);
 assert.equal(policy.toolAllowed('system_status'),false);
 assert.equal(new PolicyStore(cfg).toolAllowed('system_status'),false);
 policy.setTool('system_status',true);
 assert.equal(policy.toolAllowed('system_status'),true);
 assert.throws(()=>policy.setTool('docker_status',true),/not present/);
 assert.throws(()=>policy.setAction('docker.restart',true),/unavailable/);
});
test('write gate and per-action toggles dynamically deny without bypassing approvals',async()=>{
 const {cfg}=await fixture();
 const policy=new PolicyStore(cfg);
 assert.equal(policy.actionAllowed('file.create'),true);
 policy.setAction('file.create',false);
 assert.equal(policy.actionAllowed('file.create'),false);
 policy.setAction('file.create',true);
 policy.setWritePaused(true);
 assert.equal(policy.actionAllowed('file.create'),false);
 assert.equal(policy.toolAllowed('operation_request'),false);
 policy.setWritePaused(false);
 assert.equal(policy.actionAllowed('file.create'),true);
 policy.setTool('operation_execute',false);
 assert.equal(policy.writesAllowed(),false);
 assert.equal(policy.actionAllowed('file.create'),false);
 assert.equal(new PolicyStore(cfg).writesAllowed(),false);
});
test('per-client policy only restricts configured grants and persists',async()=>{
 const {cfg}=await fixture();
 const policy=new PolicyStore(cfg);
 const client='vpsmcp_'+'a'.repeat(43);
 assert.equal(policy.toolAllowed('system_status',client),true);
 policy.setClientTool(client,'system_status',false);
 assert.equal(policy.toolAllowed('system_status',client),false);
 assert.equal(policy.toolAllowed('system_status','vpsmcp_'+'b'.repeat(43)),true);
 assert.equal(new PolicyStore(cfg).toolAllowed('system_status',client),false);
 policy.setTool('disk_usage',false);
 policy.setClientTool(client,'disk_usage',true);
 assert.equal(policy.toolAllowed('disk_usage',client),false);
 policy.revokeClientPolicy(client);
 assert.equal(policy.toolAllowed('system_status',client),true);
});
test('policy files reject untrusted permission bits and corrupt data',async()=>{
 const {cfg}=await fixture();
 await writeFile(cfg.MCP_POLICY_FILE,JSON.stringify({version:1,disabledTools:[],disabledActions:[],writePaused:false,clientDisabledTools:{}}),{mode:0o644});
 await chmod(cfg.MCP_POLICY_FILE,0o644);
 assert.throws(()=>new PolicyStore(cfg),/must be private/);
 await chmod(cfg.MCP_POLICY_FILE,0o600);
 await writeFile(cfg.MCP_POLICY_FILE,'{"version":2}');
 assert.throws(()=>new PolicyStore(cfg));
});
