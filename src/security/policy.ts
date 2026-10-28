import {existsSync,statSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
import * as z from 'zod/v4';
import type {AppConfig} from '../shared/config.js';

export const ACTIONS=['file.create','docker.restart','deploy.sync'] as const;
export type Action=typeof ACTIONS[number];
const VALID_TOOLS=['system_status','disk_usage','workspace_list','workspace_read','docker_status','deployment_status','operation_request','operation_execute'] as const;
const schema=z.object({
  version:z.literal(1),
  disabledTools:z.array(z.enum(VALID_TOOLS)).max(8),
  disabledActions:z.array(z.enum(ACTIONS)).max(3),
  writePaused:z.boolean(),
  clientDisabledTools:z.record(z.string().regex(/^vpsmcp_[A-Za-z0-9_-]{20,80}$/),z.array(z.enum(VALID_TOOLS)).max(8))
}).strict();
type Stored=z.infer<typeof schema>;
export class PolicyStore {
  private data:Stored;
  constructor(private config:AppConfig) {
    const file=config.MCP_POLICY_FILE;
    if(existsSync(file)){
      const mode=statSync(file);
      if(!mode.isFile()||(mode.mode&0o077)!==0)throw Error('Policy file must be private');
      this.data=schema.parse(JSON.parse(readFileSync(file,'utf8')));
    } else this.data={version:1,disabledTools:[],disabledActions:[],writePaused:false,clientDisabledTools:{}};
  }
  private persist(next:Stored){
    const file=this.config.MCP_POLICY_FILE;
    mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    const temp=file+'.'+process.pid+'.tmp';
    writeFileSync(temp,JSON.stringify(next),{mode:0o600,flag:'w'});
    renameSync(temp,file);
    this.data=next;
  }
  configuredTool(name:string){return this.config.allowedTools.includes(name);}
  toolAllowed(name:string,clientId?:string){
    return this.configuredTool(name)&&!this.data.disabledTools.includes(name as typeof VALID_TOOLS[number])
      && (!clientId || !(this.data.clientDisabledTools[clientId]||[]).includes(name as typeof VALID_TOOLS[number]))
      && (!['operation_request','operation_execute'].includes(name)||this.writesAllowed());
  }
  writesAllowed(){
    return this.config.writesEnabled && !this.data.writePaused
      && ['operation_request','operation_execute'].every(t=>this.configuredTool(t)
        && !this.data.disabledTools.includes(t as typeof VALID_TOOLS[number]));
  }
  capabilityFor(action:Action){
    if(!this.config.writesEnabled)return false;
    if(action==='file.create')return !!this.config.MCP_WRITE_ROOT;
    if(action==='docker.restart')return !!this.config.MCP_DOCKER_CONTAINERS.trim();
    return this.config.MCP_ALLOW_GIT_SYNC&&!!this.config.MCP_DEPLOY_REPO;
  }
  actionAllowed(action:Action){return this.writesAllowed()&&this.capabilityFor(action)&&!this.data.disabledActions.includes(action);}
  snapshot(){
    return {
      writeConfigured:this.config.writesEnabled,writePaused:!this.writesAllowed(),
      tools:this.config.allowedTools.map(name=>({name,enabled:this.toolAllowed(name),configured:true})),
      actions:ACTIONS.map(name=>({name,configured:this.capabilityFor(name),enabled:this.actionAllowed(name)}))
    };
  }
  setTool(name:string,enabled:boolean){
    if(!this.configuredTool(name))throw Error('Tool not present in server allowlist');
    const disabled=new Set(this.data.disabledTools);
    if(enabled)disabled.delete(name as typeof VALID_TOOLS[number]);
    else disabled.add(name as typeof VALID_TOOLS[number]);
    this.persist({...this.data,disabledTools:[...disabled]});
  }
  setAction(name:string,enabled:boolean){
    if(!ACTIONS.includes(name as Action)||!this.capabilityFor(name as Action))throw Error('Action unavailable in environment');
    const disabled=new Set(this.data.disabledActions);
    if(enabled)disabled.delete(name as Action);else disabled.add(name as Action);
    this.persist({...this.data,disabledActions:[...disabled]});
  }
  setWritePaused(paused:boolean){
    if(!this.config.writesEnabled)throw Error('Write access disabled by server configuration');
    this.persist({...this.data,writePaused:paused});
  }
  clientAllowedTools(id:string){
    return this.config.allowedTools.map(name=>({name,enabled:this.toolAllowed(name,id),globalEnabled:this.toolAllowed(name)}));
  }
  setClientTool(id:string,name:string,enabled:boolean){
    if(!this.configuredTool(name))throw Error('Unknown or forbidden tool');
    if(!/^vpsmcp_[A-Za-z0-9_-]{20,80}$/.test(id))throw Error('Invalid client identifier');
    const disabled=new Set(this.data.clientDisabledTools[id]||[]);
    if(enabled)disabled.delete(name as typeof VALID_TOOLS[number]);
    else disabled.add(name as typeof VALID_TOOLS[number]);
    const clientDisabledTools={...this.data.clientDisabledTools};
    if(disabled.size)clientDisabledTools[id]=[...disabled];else delete clientDisabledTools[id];
    this.persist({...this.data,clientDisabledTools});
  }
  revokeClientPolicy(id:string){
    const clientDisabledTools={...this.data.clientDisabledTools};
    delete clientDisabledTools[id];
    this.persist({...this.data,clientDisabledTools});
  }
}