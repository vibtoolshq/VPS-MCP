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
  MCP_LOG_LEVEL: z.enum(['debug','info','warn','error']).default('info')
});
export type AppConfig = z.infer<typeof schema> & {
  origin: string;
  redirectUris: string[];
  allowedTools: string[];
  secureCookies: boolean;
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
  if (allowedTools.some(v => !['system_status','disk_usage'].includes(v))) throw new Error('Unknown or privileged tool in MCP_ALLOWED_TOOLS');
  if (new Set(allowedTools).size !== allowedTools.length) throw new Error('Duplicate tool permission');
  return {...parsed, origin: parsedOrigin.origin, secureCookies: parsedOrigin.protocol === 'https:', redirectUris, allowedTools};
}
