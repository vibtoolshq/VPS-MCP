import type { AppConfig } from '../shared/config.js';

export const READ_SCOPE = 'vps:read';
export type AccessIdentity = {clientId:string; scope:string; resource:string; expires:number};

export function canRead(identity: AccessIdentity | null, config: AppConfig): boolean {
  return !!identity && identity.expires > Date.now() && identity.resource === config.origin + '/mcp'
    && identity.scope.split(' ').includes(READ_SCOPE);
}
export function allowedTool(name: string, config: AppConfig): boolean {
  return config.allowedTools.includes(name) && (name === 'system_status' || name === 'disk_usage');
}
