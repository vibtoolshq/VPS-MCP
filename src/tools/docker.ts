// Docker daemon access belongs ONLY to the separately run broker process.
// MCP app never imports Docker or touches /var/run/docker.sock.
import type { AppConfig } from '../shared/config.js';
import { brokerCall } from '../broker/client.js';

export async function dockerStatus(config:AppConfig,container:string) {
  return brokerCall(config,{type:'docker.status',container});
}
