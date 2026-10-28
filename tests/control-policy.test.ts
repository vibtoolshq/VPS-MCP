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

test('per-client read/write scopes restrict all tools and survive restart',async()=>{
 const {cfg}=await fixture();
 const client='vpsmcp_'+'c'.repeat(43);
 const store=new PolicyStore(cfg);
 store.setClientScope(client,'vps:read',false);
 assert.equal(store.toolAllowed('system_status',client),false);
 assert.equal(store.toolAllowed('operation_request',client),false);
 store.setClientScope(client,'vps:read',true);
 store.setClientScope(client,'vps:write',false);
 assert.equal(store.toolAllowed('system_status',client),true);
 assert.equal(store.toolAllowed('operation_request',client),false);
 assert.equal(new PolicyStore(cfg).clientScopes(client).write,false);
 store.setClientScope(client,'vps:write',true);
 assert.equal(store.toolAllowed('operation_request',client),true);
 assert.throws(()=>store.setClientScope(client,'vps:admin',true),/Unknown OAuth scope/);
});

test('policy snapshot distinguishes configured preferences from effective rights',async()=>{
 const {cfg}=await fixture();
 const store=new PolicyStore(cfg);
 const id='vpsmcp_'+'d'.repeat(43);
 store.setTool('system_status',false);
 const unconfigured=store.clientAllowedTools(id).find(v=>v.name==='docker_status');
 assert.equal(unconfigured?.configured,false);
 assert.equal(unconfigured?.enabled,false);
 assert.equal(unconfigured?.effective,false);
 const tool=store.clientAllowedTools(id).find(v=>v.name==='system_status');
 assert.equal(tool?.configured,true);
 assert.equal(tool?.enabled,true); // client preference preserved for later
 assert.equal(tool?.globalEnabled,false);
 assert.equal(tool?.effective,false);
 store.setTool('system_status',true);
 store.setClientScope(id,'vps:read',false);
 assert.equal(store.clientAllowedTools(id).find(v=>v.name==='system_status')?.effective,false);
 store.setClientScope(id,'vps:read',true);
 store.setClientScope(id,'vps:write',false);
 assert.equal(store.clientScopes(id).writePolicyEnabled,false);
 assert.equal(store.clientAllowedTools(id).find(v=>v.name==='operation_request')?.effective,false);
 store.setWritePaused(true);
 assert.equal(store.snapshot().writeGatePaused,true);
 assert.equal(store.snapshot().writeEffective,false);
 assert.equal(store.snapshot().actions.find(v=>v.name==='file.create')?.enabled,true);
 assert.equal(store.snapshot().actions.find(v=>v.name==='file.create')?.effective,false);
});
test('client policy capacity fails closed',async()=>{
 const {cfg}=await fixture();
 const store=new PolicyStore(cfg);
 for(let n=0;n<32;n++)store.setClientScope('vpsmcp_'+n.toString(36).padStart(43,'x'),'vps:read',false);
 assert.throws(()=>store.setClientScope('vpsmcp_'+'z'.repeat(43),'vps:read',false),/capacity/);
 assert.equal(new PolicyStore(cfg).clientScopes('vpsmcp_'+'z'.repeat(43)).read,true);
});

test('tool is not operational merely because its name appears in the env allowlist',async()=>{
 const {cfg}=await fixture();
 const sparse={...cfg,MCP_READ_ROOT:'',MCP_DOCKER_CONTAINERS:'',MCP_DEPLOY_REPO:'',allowedTools:[
   ...cfg.allowedTools,'docker_status','deployment_status'
 ]};
 const policy=new PolicyStore(sparse);
 for(const name of ['workspace_list','docker_status','deployment_status']){
   const item=policy.snapshot().tools.find(v=>v.name===name);
   assert.equal(item?.configured,false);
   assert.equal(item?.enabled,false);
   assert.equal(policy.toolAllowed(name),false);
   assert.throws(()=>policy.setTool(name,true),/not present/);
 }
 assert.equal(policy.toolAllowed('system_status'),true);
});
