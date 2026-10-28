# Phase 03 Architecture

```text
MCP client (ChatGPT-compatible)        Admin browser
           |                                 |
    HTTPS / secure tunnel            HTTPS / local
           |                                 |
           +------------ Node HTTP(S) ------+
                                 |
                     Host / Origin checks
                      |             |
         OAuth bearer gate        Admin session
                |                 login + CSRF
           /mcp handler                 |
                |                  Compact panel
           vps:read scope          status / controls
                |
          SDK tool handlers
           /          \
  system_status     disk_usage
```

## Auth boundary

- `/mcp`: every request must supply an unexpired opaque bearer access token scoped `vps:read` and bound to exactly the configured MCP resource audience.
- OAuth server: discovery metadata, exact callback allowlist for Dynamic Client Registration, S256 PKCE challenge verified during single-use code exchange; rotating refresh tokens and token revocation.
- Web dashboard: separate scrypt password verification + HttpOnly SameSite session cookie + CSRF verification for state-changing actions.
- Deny-by-default tool registration: only configured allowlisted read-only operations are exported.
- Audit: actions/outcomes and bounded actor names, no raw credentials/request bodies.

## Network options

Local mode uses `127.0.0.1` and HTTP. A public listener requires native HTTPS certificate/key, host validation and origin configuration. A local-only listener can also sit behind a trusted HTTPS gateway/tunnel; configure the canonical external URL for OAuth resource and cookies.

Dockerfile and Compose remain disabled until Phase 05 packaging/security validation. No Docker access is granted to MCP itself in Phase 03.

## Storage

- `data/audit.jsonl` appends sanitized JSON events; 0600 on creation.
- `data/oauth-state.json` persists OAuth client records and hashed refresh tokens; 0600 on creation, atomically replaced.
- Sessions, authorization codes and short-lived access tokens remain in memory.

## Threat / trust boundaries

Only an authenticated administrator can approve OAuth clients; client registration alone does not authorize a tool. Exact redirect allowlist reduces callback abuse. Admin and MCP operations use different credentials and paths. Reverse proxies must not expose local endpoints without TLS and correct Host validation.
