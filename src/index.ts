import { loadConfig } from './shared/config.js';
import { listenServer } from './server/http.js';

async function main() {
  const config=loadConfig();
  const app=await listenServer(config);
  process.stderr.write(`VPS-MCP Phase 03 listening on ${app.url} (public origin: ${config.origin})\n`);
  let stopping=false;
  const stop=async()=>{
    if(stopping)return;
    stopping=true;
    try{await app.shutdown();process.exitCode=0;}
    catch{process.stderr.write('Shutdown failed\n');process.exitCode=1;}
  };
  process.on('SIGINT',()=>{void stop();});
  process.on('SIGTERM',()=>{void stop();});
}
main().catch(()=>{process.stderr.write('MCP startup failed; check configuration and certificate paths.\n');process.exitCode=1;});
