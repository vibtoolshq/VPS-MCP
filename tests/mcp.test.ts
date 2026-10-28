import test from 'node:test';
import assert from 'node:assert/strict';
import { type AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from '../src/server/http.js';

async function withServer(work: (baseUrl: string) => Promise<void>) {
  const instance = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    instance.server.once('error', reject);
    instance.server.listen(0, '127.0.0.1', resolve);
  });
  const address = instance.server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await instance.shutdown();
  }
}

test('health works, rejected host/origin, no GET MCP, no accidental public route', async () => {
  await withServer(async base => {
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { mode: string }).mode, 'read-only');

    assert.equal((await fetch(base + '/mcp')).status, 405);
    assert.equal((await fetch(base + '/not-found')).status, 404);
    assert.equal((await fetch(base + '/health', { headers: { Host: 'evil.example' } })).status, 403);
    assert.equal((await fetch(base + '/health', { headers: { Origin: 'https://evil.example' } })).status, 403);
  });
});

test('MCP client can list read-only tools and call both', async () => {
  await withServer(async base => {
    const client = new Client({ name: 'phase02-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(base + '/mcp'));
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map(tool => tool.name).sort(), ['disk_usage', 'system_status']);
      assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));
      const result = await client.callTool({ name: 'system_status', arguments: {} });
      assert.notEqual(result.isError, true);
      assert.ok(result.content);
      const disk = await client.callTool({ name: 'disk_usage', arguments: { path: '/' } });
      assert.notEqual(disk.isError, true);
      const bad = await client.callTool({ name: 'disk_usage', arguments: { path: '/etc' } });
      assert.equal(bad.isError, true);
    } finally {
      await client.close();
    }
  });
});
