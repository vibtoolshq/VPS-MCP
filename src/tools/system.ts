import { statfs } from 'node:fs/promises';
import os from 'node:os';

export function systemStatus() {
  return {
    platform: os.platform(),
    architecture: os.arch(),
    cpuCount: os.availableParallelism(),
    uptimeSeconds: Math.floor(os.uptime()),
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    loadAverage: os.loadavg(),
    nodeVersion: process.version
  };
}

export type DiskPath = '/' | '/tmp';

// Exact allowlist: never accept client-controlled arbitrary file paths.
export async function diskUsage(path: DiskPath) {
  const data = await statfs(path);
  const blockSize = BigInt(data.bsize);
  const total = blockSize * BigInt(data.blocks);
  const available = blockSize * BigInt(data.bavail);
  // Use string byte counts to preserve precision on large volumes.
  return {
    path,
    totalBytes: total.toString(),
    availableBytes: available.toString(),
    usedBytes: (total - blockSize * BigInt(data.bfree)).toString()
  };
}
