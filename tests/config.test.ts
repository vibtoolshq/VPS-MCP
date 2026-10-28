import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/shared/config.js';
import { diskUsage, systemStatus } from '../src/tools/system.js';

test('only loopback is allowed and port is validated', () => {
  assert.equal(loadConfig({}).MCP_HOST, '127.0.0.1');
  assert.equal(loadConfig({ MCP_PORT: '7000' }).MCP_PORT, 7000);
  assert.throws(() => loadConfig({ MCP_HOST: '0.0.0.0' }));
  assert.throws(() => loadConfig({ MCP_HOST: 'localhost' }));
  assert.throws(() => loadConfig({ MCP_PORT: '70000' }));
  assert.throws(() => loadConfig({ MCP_PORT: 'nope' }));
});

test('system metrics are read-only and bounded', () => {
  const status = systemStatus();
  assert.ok(status.cpuCount >= 1);
  assert.ok(status.totalMemoryBytes > 0);
  assert.ok(status.uptimeSeconds >= 0);
  assert.equal(Object.hasOwn(status, 'environment'), false);
});

test('disk stats use precision-safe byte strings', async () => {
  const result = await diskUsage('/');
  assert.equal(result.path, '/');
  assert.match(result.totalBytes, /^\d+$/);
});
