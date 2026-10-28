import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { diskUsage, systemStatus } from '../tools/system.js';
import type { AuditLog } from '../security/audit.js';

function textResult(value:unknown) {
  return {content:[{type:'text' as const,text:JSON.stringify(value)}]};
}
export function createMcpServer(allowedTools:string[]=['system_status','disk_usage'], audit?:AuditLog):McpServer {
  const server=new McpServer({name:'vps-mcp',version:'0.3.0'},{maxToolInputElements:16});
  if(allowedTools.includes('system_status')){
    server.registerTool('system_status',{
      title:'System Status',
      description:'Read CPU, RAM, uptime and load without executing shell commands.',
      inputSchema:z.object({}).strict(),
      annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
    },async()=>{
      audit?.record('mcp.request','success','oauth','system_status');
      return textResult(systemStatus());
    });
  }
  if(allowedTools.includes('disk_usage')){
    server.registerTool('disk_usage',{
      title:'Disk Usage',
      description:'Read disk statistics for only / or /tmp.',
      inputSchema:z.object({path:z.enum(['/','/tmp'])}).strict(),
      annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
    },async({path})=>{
      try {
        const value=await diskUsage(path);
        audit?.record('mcp.request','success','oauth','disk_usage');
        return textResult(value);
      } catch {
        audit?.record('mcp.request','error','oauth','disk_usage');
        return {content:[{type:'text' as const,text:'Disk statistics unavailable'}],isError:true};
      }
    });
  }
  return server;
}
