import type { AppConfig } from '../shared/config.js';

export const READ_SCOPE = 'vps:read';
export const WRITE_SCOPE = 'vps:write';
export type AccessIdentity = {clientId:string; scope:string; resource:string; expires:number};

export function canRead(identity: AccessIdentity | null, config: AppConfig): boolean {
  return !!identity && identity.expires > Date.now() && identity.resource === config.origin + '/mcp'
    && identity.scope.split(' ').includes(READ_SCOPE);
}
export function canWrite(identity: AccessIdentity | null, config: AppConfig): boolean {
  return config.writesEnabled && canRead(identity,config) && identity!.scope.split(' ').includes(WRITE_SCOPE);
}
export function allowedTool(name: string, config: AppConfig): boolean {
  return config.allowedTools.includes(name);
}
