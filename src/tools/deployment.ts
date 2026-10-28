// Git deployment operations run exclusively in the least-privileged broker.
import type { AppConfig } from '../shared/config.js';
import { brokerCall } from '../broker/client.js';

export async function deploymentStatus(config:AppConfig) {
  return brokerCall(config,{type:'deploy.status'});
}
