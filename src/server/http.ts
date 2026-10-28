import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler
} from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMcpServer } from './mcp.js';
import type { AppConfig } from '../shared/config.js';

export function createHttpServer(): { server: Server; shutdown: () => Promise<void> } {
  const handler = createMcpHandler(createMcpServer, { responseMode: 'json' });
  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const server = createServer((req, res) => {
    // DNS rebinding and browser cross-origin protections are required even on loopback.
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;

    const path = (req.url ?? '/').split('?', 1)[0];
    if (path === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok', service: 'vps-mcp', mode: 'read-only', remoteAccess: false }));
      return;
    }
    if (path === '/mcp') {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
        res.end('Method not allowed');
        return;
      }
      void Promise.resolve(nodeHandler(req, res)).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end('Internal server error');
        } else {
          res.destroy();
        }
      });
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  });

  return {
    server,
    shutdown: async () => {
      await handler.close();
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
    }
  };
}

export async function listenLocal(config: AppConfig) {
  const instance = createHttpServer();
  try {
    await new Promise<void>((resolve, reject) => {
      instance.server.once('error', reject);
      instance.server.listen(config.MCP_PORT, config.MCP_HOST, () => {
        instance.server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await instance.shutdown().catch(() => undefined);
    throw error;
  }
  const address = instance.server.address() as AddressInfo;
  return { ...instance, url: `http://${config.MCP_HOST}:${address.port}` };
}
