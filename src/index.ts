import { loadConfig } from './shared/config.js';
import { listenLocal } from './server/http.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const application = await listenLocal(config);
  process.stderr.write(`VPS-MCP Phase 02 listening locally: ${application.url}/mcp\n`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await application.shutdown();
      process.exitCode = 0;
    } catch {
      process.stderr.write('Shutdown failed\n');
      process.exitCode = 1;
    }
  };
  process.on('SIGINT', () => { void stop(); });
  process.on('SIGTERM', () => { void stop(); });
}

main().catch(() => {
  process.stderr.write('MCP startup failed. Check bind address, port and configuration.\n');
  process.exitCode = 1;
});
