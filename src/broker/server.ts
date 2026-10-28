import { createServer, type Server } from 'node:net';
import { existsSync } from 'node:fs';
import { chmod, mkdir, stat, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { safePath, workspaceCreate } from '../tools/filesystem.js';
import { brokerActionSchema, brokerRequestSchema, type BrokerAction } from './protocol.js';
import type { AppConfig } from '../shared/config.js';
import { safeEqual } from '../security/authentication.js';

const execFile=promisify(execFileCallback);
const executionEnv={
  PATH:'/usr/local/bin:/usr/bin:/bin',
  HOME:'/nonexistent',
  GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',
  GIT_TERMINAL_PROMPT:'0',GIT_LFS_SKIP_SMUDGE:'1',
  GIT_SSH_COMMAND:'/usr/bin/false'
};
async function run(exe:string,args:string[],cwd?:string) {
  const {stdout,stderr}=await execFile(exe,args,{
    cwd,env:executionEnv,timeout:12000,maxBuffer:65536,windowsHide:true
  });
  return (stdout||stderr).slice(0,16384);
}
function allowContainer(config:AppConfig,name:string) {
  const permitted=config.MCP_DOCKER_CONTAINERS.split(',').map(v=>v.trim()).filter(Boolean);
  if(!permitted.includes(name))throw new Error('denied');
}
async function allowedRepo(config:AppConfig) {
  if(!config.MCP_DEPLOY_REPO)throw new Error('denied');
  const root=await safePath(config.MCP_DEPLOY_REPO,'',{rootAllowed:true});
  const st=await stat(root);
  if(!st.isDirectory())throw new Error('denied');
  return root;
}
export async function executeBrokerAction(config:AppConfig,raw:unknown):Promise<unknown> {
  const action:BrokerAction=brokerActionSchema.parse(raw);
  if(action.type==='file.create') {
    if(!config.MCP_WRITE_ROOT || !config.writesEnabled)throw new Error('denied');
    return workspaceCreate(config.MCP_WRITE_ROOT,action.path,action.content);
  }
  if(action.type==='docker.status'){
    allowContainer(config,action.container);
    const lines=await run('docker',['ps','-a','--filter','name=^/'+action.container+'$','--format','{{json .}}']);
    if(!lines.trim())return {container:action.container,found:false};
    const info=JSON.parse(lines.split('\n')[0]!) as Record<string,string>;
    return {container:action.container,found:true,status:info.Status||'',state:info.State||''};
  }
  if(action.type==='docker.restart'){
    if(!config.writesEnabled)throw new Error('denied');
    allowContainer(config,action.container);
    await run('docker',['container','restart','--time','10',action.container]);
    return {restarted:action.container};
  }
  if(action.type==='deploy.status') {
    const cwd=await allowedRepo(config);
    const revision=await run('git',['-c','core.hooksPath=/dev/null','rev-parse','--short','HEAD'],cwd);
    const changes=await run('git',['-c','core.hooksPath=/dev/null','status','--porcelain'],cwd);
    return {revision:revision.trim(),dirtyFiles:changes.split('\n').filter(Boolean).length,branch:config.MCP_DEPLOY_BRANCH};
  }
  if(action.type==='deploy.sync') {
    if(!config.writesEnabled || !config.MCP_ALLOW_GIT_SYNC)throw new Error('denied');
    const cwd=await allowedRepo(config);
    const current=(await run('git',['-c','core.hooksPath=/dev/null','branch','--show-current'],cwd)).trim();
    if(current!==config.MCP_DEPLOY_BRANCH)throw new Error('denied');
    const changes=await run('git',['-c','core.hooksPath=/dev/null','status','--porcelain'],cwd);
    if(changes.trim())throw new Error('denied');
    // Explicit origin/branch only; no user-supplied command, URL, shell or build.
    // Use ONLY with trusted repositories under a dedicated unprivileged OS user.
    const output=await run('git',['-c','core.hooksPath=/dev/null','-c','protocol.file.allow=never',
      '-c','protocol.ext.allow=never','pull','--ff-only','origin',config.MCP_DEPLOY_BRANCH],cwd);
    return {synced:true,summary:output.slice(0,500)};
  }
  throw new Error('denied');
}
export async function startBroker(config:AppConfig):Promise<{server:Server;stop:()=>Promise<void>}> {
  if(!path.isAbsolute(config.MCP_BROKER_SOCKET)||config.MCP_BROKER_SECRET.length<32)throw new Error('Broker socket and secret are required');
  const dir=path.dirname(config.MCP_BROKER_SOCKET);
  await mkdir(dir,{recursive:true,mode:0o700});
  const folder=await lstat(dir);
  if(!folder.isDirectory() || folder.isSymbolicLink())throw new Error('Broker socket parent must be a real directory');
  if((folder.mode & 0o077)!==0)throw new Error('Broker socket parent directory must be private (0700)');
  if(existsSync(config.MCP_BROKER_SOCKET))throw new Error('Broker socket path already exists');
  const server=createServer(socket=>{
    let data='';let done=false;
    socket.setTimeout(15000,()=>socket.destroy());
    socket.on('data',(chunk:Buffer)=>{
      if(done)return;
      data+=chunk.toString('utf8');
      if(data.length>32768){done=true;socket.end('{"ok":false,"error":"denied"}\n');return;}
      const index=data.indexOf('\n');
      if(index<0)return;
      done=true;
      void (async()=>{
        try{
          const parsed=brokerRequestSchema.parse(JSON.parse(data.slice(0,index)));
          if(!safeEqual(parsed.secret,config.MCP_BROKER_SECRET))throw new Error('denied');
          const result=await executeBrokerAction(config,parsed.operation);
          socket.end(JSON.stringify({ok:true,result})+'\n');
        }catch{socket.end('{"ok":false,"error":"denied"}\n');}
      })();
    });
    socket.on('error',()=>undefined);
  });
  await new Promise<void>((resolve,reject)=>{
    server.once('error',reject);
    server.listen(config.MCP_BROKER_SOCKET,()=>{
      server.off('error',reject);resolve();
    });
  });
  await chmod(config.MCP_BROKER_SOCKET,0o600);
  return {server,stop:async()=>{
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    await unlink(config.MCP_BROKER_SOCKET).catch(()=>undefined);
  }};
}
