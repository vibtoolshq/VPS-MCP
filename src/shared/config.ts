import * as z from 'zod/v4';

const schema = z.object({
  MCP_HOST: z.string().default('127.0.0.1'),
  MCP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_PUBLIC_URL: z.string().optional(),
  MCP_TLS_CERT_FILE: z.string().optional(),
  MCP_TLS_KEY_FILE: z.string().optional(),
  ADMIN_USERNAME: z.string().min(3).max(64).default('admin'),
  ADMIN_PASSWORD_HASH: z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/),
  OAUTH_ALLOWED_REDIRECT_URIS: z.string().default(''),
  MCP_ALLOWED_TOOLS: z.string().default('system_status,disk_usage'),
  MCP_AUDIT_FILE: z.string().default('./data/audit.jsonl'),
  MCP_STATE_FILE: z.string().default('./data/oauth-state.json'),
  MCP_CONTROL_FILE: z.string().default('./data/control.json'),
  MCP_READ_ROOT: z.string().default(''),
  MCP_WRITE_ROOT: z.string().default(''),
  MCP_DOCKER_CONTAINERS: z.string().default(''),
  MCP_DEPLOY_REPO: z.string().default(''),
  MCP_DEPLOY_BRANCH: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,63}$/).default('main'),
  MCP_BROKER_SOCKET: z.string().default(''),
  MCP_BROKER_SECRET: z.string().default(''),
  MCP_ENABLE_WRITES: z.enum(['true','false']).default('false'),
  MCP_ALLOW_GIT_SYNC: z.enum(['true','false']).default('false'),
  MCP_LOG_LEVEL: z.enum(['debug','info','warn','error']).default('info')
});
export type AppConfig = Omit<z.infer<typeof schema>, 'MCP_ALLOW_GIT_SYNC'> & {
  origin: string;
  redirectUris: string[];
  allowedTools: string[];
  secureCookies: boolean;
  writesEnabled: boolean;
  MCP_ALLOW_GIT_SYNC: boolean;
};
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(source);
  const publicUrl = parsed.MCP_PUBLIC_URL;
  const tls = Boolean(parsed.MCP_TLS_CERT_FILE && parsed.MCP_TLS_KEY_FILE);
  if (Boolean(parsed.MCP_TLS_CERT_FILE) !== Boolean(parsed.MCP_TLS_KEY_FILE)) {
    throw new Error('Both TLS cert and key must be configured together');
  }
  if (parsed.MCP_HOST !== '127.0.0.1' && parsed.MCP_HOST !== '0.0.0.0') {
    throw new Error('Only 127.0.0.1 or 0.0.0.0 bind is supported');
  }
  if (parsed.MCP_HOST !== '127.0.0.1' && !tls) {
    throw new Error('A public listener requires native HTTPS with a configured certificate');
  }
  const origin = publicUrl || (tls ? '' : `http://127.0.0.1:${parsed.MCP_PORT}`);
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash || parsedOrigin.username || parsedOrigin.password) {
    throw new Error('MCP_PUBLIC_URL must be a bare origin');
  }
  if (parsedOrigin.protocol !== 'https:' && !(parsed.MCP_HOST === '127.0.0.1' && parsedOrigin.href === `http://127.0.0.1:${parsed.MCP_PORT}/`)) {
    throw new Error('External MCP origin must use HTTPS; HTTP is local-only');
  }
  if (parsed.MCP_HOST === '0.0.0.0' && !publicUrl) throw new Error('Public listener requires MCP_PUBLIC_URL');
  const redirectUris = parsed.OAUTH_ALLOWED_REDIRECT_URIS.split(',').map(v => v.trim()).filter(Boolean);
  for (const uri of redirectUris) {
    const url = new URL(uri);
    if (url.username || url.password || url.hash || !['https:','http:'].includes(url.protocol)) throw new Error('Invalid OAuth redirect URI');
    if (url.protocol !== 'https:' && !(parsed.MCP_HOST === '127.0.0.1' && ['127.0.0.1','localhost'].includes(url.hostname))) {
      throw new Error('OAuth redirect URIs must use HTTPS except loopback development callbacks');
    }
  }
  const allowedTools = parsed.MCP_ALLOWED_TOOLS.split(',').map(v => v.trim()).filter(Boolean);
  const declared = ['system_status','disk_usage','workspace_list','workspace_read','docker_status','deployment_status','operation_request','operation_execute'];
  if (allowedTools.some(v => !declared.includes(v))) throw new Error('Unknown or privileged tool in MCP_ALLOWED_TOOLS');
  if (new Set(allowedTools).size !== allowedTools.length) throw new Error('Duplicate tool permission');
  const writesEnabled=parsed.MCP_ENABLE_WRITES==='true';
  if ((writesEnabled || allowedTools.some(v=>['docker_status','deployment_status','operation_request','operation_execute'].includes(v)))
    && (!parsed.MCP_BROKER_SOCKET.startsWith('/') || parsed.MCP_BROKER_SECRET.length<32)) {
    throw new Error('Broker socket (absolute) and long secret required for broker tools');
  }
  if (writesEnabled && (!allowedTools.includes('operation_request') || !allowedTools.includes('operation_execute')))
    throw new Error('Both approval MCP tools are required to enable write operations');
  if (!writesEnabled && allowedTools.some(v=>v==='operation_request'||v==='operation_execute'))
    throw new Error('Write approval tools may not be enabled without MCP_ENABLE_WRITES=true');
  if (parsed.MCP_READ_ROOT && !parsed.MCP_READ_ROOT.startsWith('/')) throw new Error('Read root must be absolute');
  if (parsed.MCP_WRITE_ROOT && !parsed.MCP_WRITE_ROOT.startsWith('/')) throw new Error('Write root must be absolute');
  if (parsed.MCP_DEPLOY_REPO && !parsed.MCP_DEPLOY_REPO.startsWith('/')) throw new Error('Deploy repo must be absolute');
  if (parsed.MCP_DOCKER_CONTAINERS.split(',').filter(Boolean).some(v=>!/^[A-Za-z][\w.-]{0,63}$/.test(v.trim())))
    throw new Error('Invalid Docker allowlist');
  return {...parsed, writesEnabled, MCP_ALLOW_GIT_SYNC:parsed.MCP_ALLOW_GIT_SYNC==='true', origin: parsedOrigin.origin, secureCookies: parsedOrigin.protocol === 'https:', redirectUris, allowedTools};
}
