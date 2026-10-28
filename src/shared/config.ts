import * as z from 'zod/v4';

const envSchema = z.object({
  // Phase 02 has no authentication: NEVER accept a non-loopback bind address.
  MCP_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  MCP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(source);
}
