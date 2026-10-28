# VPS-MCP architecture

## Phase 02 implemented

```text
local MCP client
    |
127.0.0.1:<port>  (Node.js HTTP)
    |
Host + Origin validations
    |
  GET /health  |  POST /mcp
                     |
               createMcpHandler
                 (stateless)
                     |
              fresh McpServer
                     |
             Zod validated tools
              /             \
     system_status       disk_usage
        node:os         node:fs statfs
```

The server uses the official **TypeScript SDK v2** and `@modelcontextprotocol/node` adapter, with `createMcpHandler` creating a fresh MCP server for each request. JSON response mode is used for simple read-only tools.

Modules:
- `src/index.ts`: startup and graceful shutdown.
- `src/server/http.ts`: routing, loopback guards, health.
- `src/server/mcp.ts`: read-only MCP tool registration.
- `src/tools/system.ts`: system/disk metrics.
- `src/shared/config.ts`: schema-validated local-only configuration.

## Phase 03 planned

Identity-based authentication, per-tool authorization, rate limiting, structured audit logging and TLS/secure tunnel. **No proxying the current unauthenticated server onto the internet.**

## Phase 04 planned

Filesystem and Docker operations via narrowly scoped permissions; no unrestricted shell or direct unrestricted Docker socket binding.

## Phase 05 planned

Hardened multi-stage Docker build, Compose, CI and portable VPS installation/uninstallation instructions.
