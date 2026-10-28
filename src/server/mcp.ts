import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { diskUsage, systemStatus } from '../tools/system.js';

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

// A fresh MCP server is created per request, as required by createMcpHandler.
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'vps-mcp', version: '0.1.0' }, { maxToolInputElements: 16 });

  server.registerTool(
    'system_status',
    {
      title: 'System Status',
      description: 'Read CPU count, architecture, memory, uptime and load on this server (no shell commands).',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => textResult(systemStatus())
  );

  server.registerTool(
    'disk_usage',
    {
      title: 'Disk Usage',
      description: 'Read disk space statistics for an explicitly allowed local mount path.',
      inputSchema: z.object({ path: z.enum(['/', '/tmp']) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ path }) => {
      try {
        return textResult(await diskUsage(path));
      } catch {
        return {
          content: [{ type: 'text' as const, text: 'Unable to read disk statistics for the allowed path.' }],
          isError: true
        };
      }
    }
  );

  return server;
}
