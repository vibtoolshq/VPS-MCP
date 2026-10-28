# VPS-MCP

A lightweight, portable **Node.js + TypeScript MCP server** with an OAuth-enabled read-only API and a clean, responsive, login-verified web control panel. Intended for Ubuntu VPS management via compatible MCP clients.

> **Phase 03 — implementation & CI verification.** OAuth 2.1 authorization-code/PKCE, admin login, HTTPS configuration, read-only MCP permissions, audit log and control panel are implemented. **Docker/Compose packaging, VPS deployment and a live ChatGPT connection are NOT completed.** Never expose an untested build to the internet.

## Included in Phase 03

- Official MCP TypeScript SDK v2; stateless Streamable HTTP at `POST /mcp`.
- OAuth authorization server discovery, protected-resource metadata, dynamic client registration restricted to a configured exact redirect-URI allowlist, authorization code + PKCE-S256, access token and rotating refresh token.
- Small HTML/CSS/vanilla-JS dashboard. Admin password verified with scrypt; HttpOnly SameSite cookie, secure cookie over HTTPS, CSRF-protected controls, login failure throttling.
- Dashboard overview: MCP enable/disable switch, tool allowlist, system metrics, registered clients, active token counts, recent audit entries and logout.
- `vps:read` scope gate on every MCP HTTP request; the two existing tools remain **read-only**: `system_status`, `disk_usage`.
- No external shell execution, no file modifications, no Docker socket, no privilege escalation.
- Config requires a native TLS certificate/key to bind publicly. For an HTTPS tunnel/reverse proxy, bind only to loopback and declare its externally accessible HTTPS origin.
- Audit JSONL with redacted/fixed event fields; client IDs and hashed rotating refresh tokens persisted in a gitignored 0600 state file. Admin sessions reset on restart.

## Requirements

- Node.js 22.9+ (22.23+ recommended), npm
- A compatible MCP client; remote connections additionally require an HTTPS hostname or authenticated tunnel and the correct OAuth redirect URI.
- **No additional VPS necessary.** This project consumes resources on the machine you run it on.

## Local development (safe loopback-only)

```bash
git clone https://github.com/vibtoolshq/VPS-MCP.git
cd VPS-MCP
npm install
cp .env.example .env
node scripts/hash-password.mjs
```

**Copy the printed `ADMIN_PASSWORD_HASH=...` into `.env`** (do not share it publicly). Set a strong admin password. Leave `MCP_HOST=127.0.0.1` and `MCP_PUBLIC_URL` unset for local tests.

```bash
npm run check
npm run dev
```

Open the local panel at **http://127.0.0.1:3000** **on the same computer**, then log in using the configured admin username and password. The HTTP endpoint is inaccessible remotely in this mode.

Useful paths:

| Route | Access |
| --- | --- |
| `/` | Login / compact admin panel |
| `/health` | Minimal public health check |
| `/api/session`, `/api/status` | Admin session only |
| `/api/mcp` | Admin session + CSRF, temporary MCP kill switch |
| `/mcp` | OAuth bearer token with `vps:read` |
| `/.well-known/oauth-protected-resource` | OAuth protected resource discovery |
| `/.well-known/oauth-authorization-server` | OAuth AS metadata |
| `/oauth/register`, `/oauth/authorize`, `/oauth/token` | OAuth PKCE lifecycle |

### Production-facing remote configuration (not yet deployed)

Two possible HTTPS arrangements:

1. **Native HTTPS**: `MCP_HOST=0.0.0.0` + `MCP_PUBLIC_URL=https://your-hostname[:port]` + cert/key paths. Bind only after access controls, DNS, TLS and firewall review.
2. **Loopback + trusted HTTPS reverse proxy/tunnel**: keep `MCP_HOST=127.0.0.1`; set `MCP_PUBLIC_URL=https://your-hostname`. Terminate TLS at the trusted gateway and forward to the loopback service; preserve the correct external Host value.

In either case, put the **exact redirect URI** from the ChatGPT connection UI into `OAUTH_ALLOWED_REDIRECT_URIS`. ChatGPT generally requires OAuth rather than a manually supplied static API key. The user must log into the panel and explicitly approve read-only access during OAuth authorization. <https://developers.openai.com/plugins/build/auth>

**Do not paste tokens, passwords, OAuth codes, admin hashes or `.env` contents into ChatGPT conversations or GitHub.** Do not enable arbitrary unauthenticated tunnels.

**Current limits:** runtime session/auth-code caches are memory-only; persisted OAuth clients and refresh-token hashes survive restarts, but existing access tokens do not. The audit log and state files are local disk files. Full live ChatGPT and TLS deployment testing is reserved for release verification.

## Project tree

```text
VPS-MCP/
├── README.md
├── public/{panel.html,panel.css,panel.js}
├── src/
│   ├── index.ts
│   ├── server/{http.ts,mcp.ts}
│   ├── security/{authentication.ts,oauth.ts,authorization.ts,audit.ts}
│   ├── tools/{system.ts,filesystem.ts,docker.ts,deployment.ts}
│   └── shared/config.ts
├── config/permissions.example.json
├── tests/{config.test.ts,mcp.test.ts}
├── scripts/hash-password.mjs
├── docs/{ARCHITECTURE.md,SECURITY.md,ROADMAP.md}
├── .env.example
├── package.json
├── tsconfig.json
├── Dockerfile       # intentionally not deployable until Phase 05
└── compose.yaml     # intentionally empty until Phase 05
```

## Planned five phases

| Phase | Purpose | Status |
| --- | --- | --- |
| 01 | Structure & documentation | Complete |
| 02 | Read-only MCP core & tests | Complete |
| 03 | OAuth, permissions, audit, HTTPS support & compact verified-login UI | Implemented, CI checked |
| 04 | Optional limited files/Docker/deployment operations | Not started |
| 05 | Hardened Docker build, Compose, installer, VPS verification and ChatGPT integration test | Not started |

## License

Not yet selected; a public GitHub repository does not by itself grant a redistribution license.
