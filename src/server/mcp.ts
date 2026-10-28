import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { diskUsage, systemStatus } from '../tools/system.js';
import { workspaceList, workspaceRead } from '../tools/filesystem.js';
import { dockerStatus } from '../tools/docker.js';
import { deploymentStatus } from '../tools/deployment.js';
import { brokerCall } from '../broker/client.js';
import { operationSchema, type WriteOperation, type ApprovalQueue } from '../security/approvals.js';
import { canWrite, type AccessIdentity } from '../security/authorization.js';
import type { AppConfig } from '../shared/config.js';
import type { AuditLog } from '../security/audit.js';

function result(value:unknown){return {content:[{type:'text' as const,text:JSON.stringify(value)}]};}
function denied(message='Operation denied by policy'){return {isError:true,content:[{type:'text' as const,text:message}]};}
function requestActor(context?:AsyncLocalStorage<AccessIdentity>) {return context?.getStore()?.clientId||'unknown';}

export function createMcpServer(
  allowedTools:string[]=['system_status','disk_usage'],
  audit?:AuditLog,
  config?:AppConfig,
  approvals?:ApprovalQueue,
  context?:AsyncLocalStorage<AccessIdentity>
):McpServer {
  const server=new McpServer({name:'vps-mcp',version:'0.4.0'},{maxToolInputElements:16});
  const registered=(name:string)=>allowedTools.includes(name);
  const actor=()=>requestActor(context);
  const logged=async <T>(name:string,call:()=>Promise<T>|T) => {
    try{
      const value=await call();
      audit?.record('mcp.request','success',actor(),name);
      return result(value);
    }catch{
      audit?.record('mcp.request','denied',actor(),name);
      return denied('Unavailable or denied by configured permissions');
    }
  };
  const readOnly={readOnlyHint:true,destructiveHint:false,openWorldHint:false} as const;
  if(registered('system_status'))
    server.registerTool('system_status',{
      description:'Read CPU, RAM, uptime and load. No shell.',
      inputSchema:z.object({}).strict(),annotations:readOnly
    },async()=>logged('system_status',systemStatus));
  if(registered('disk_usage'))
    server.registerTool('disk_usage',{
      description:'Disk statistics only for / and /tmp.',
      inputSchema:z.object({path:z.enum(['/','/tmp'])}).strict(),annotations:readOnly
    },async({path})=>logged('disk_usage',()=>diskUsage(path)));
  if(registered('workspace_list'))
    server.registerTool('workspace_list',{
      description:'List up to 50 visible entries inside configured read-only workspace.',
      inputSchema:z.object({path:z.string().max(180).default('')}).strict(),annotations:readOnly
    },async({path})=>logged('workspace_list',()=>workspaceList(config?.MCP_READ_ROOT||'',path)));
  if(registered('workspace_read'))
    server.registerTool('workspace_read',{
      description:'Read at most 64 KiB of text from a configured workspace. Hidden files and symlinks denied.',
      inputSchema:z.object({path:z.string().min(1).max(180)}).strict(),annotations:readOnly
    },async({path})=>logged('workspace_read',()=>workspaceRead(config?.MCP_READ_ROOT||'',path)));
  if(registered('docker_status'))
    server.registerTool('docker_status',{
      description:'Read sanitized status of an explicitly allowlisted Docker container through a Unix broker.',
      inputSchema:z.object({container:z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/)}).strict(),annotations:readOnly
    },async({container})=>logged('docker_status',()=>dockerStatus(config!,container)));
  if(registered('deployment_status'))
    server.registerTool('deployment_status',{
      description:'Read the revision and dirty-file count of a fixed configured Git deployment repo.',
      inputSchema:z.object({}).strict(),annotations:readOnly
    },async()=>logged('deployment_status',()=>deploymentStatus(config!)));
  if(config?.writesEnabled && approvals && context && registered('operation_request') && registered('operation_execute')){
    server.registerTool('operation_request',{
      description:'Propose a restricted write operation. Does not execute anything; an administrator must approve it separately in the web panel.',
      inputSchema:z.object({operation:operationSchema}).strict(),
      annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
    },async({operation})=>{
      const identity=context.getStore();
      if(!canWrite(identity||null,config)){
        audit?.record('operation.propose','denied',actor());
        return denied('OAuth write scope required');
      }
      return logged('operation_request',()=>approvals.propose(identity!.clientId,operation));
    });
    server.registerTool('operation_execute',{
      description:'Execute a previously admin-approved single-use operation through the restricted Unix socket broker.',
      inputSchema:z.object({approvalId:z.string().min(20).max(64)}).strict(),
      annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}
    },async({approvalId})=>{
      const identity=context.getStore();
      if(!canWrite(identity||null,config)){
        audit?.record('operation.execute','denied',actor());
        return denied('OAuth write scope required');
      }
      return logged('operation_execute',()=>approvals.execute(approvalId,identity!.clientId,(op:WriteOperation)=>brokerCall(config,op)));
    });
  }
  return server;
}
