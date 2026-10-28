# VPS-MCP

A lightweight, portable **Node.js + TypeScript MCP server** with an OAuth-secured, permission-controlled API and a clean, responsive, login-verified web control panel. Intended for Ubuntu VPS management via compatible MCP clients.

> **Phase 04 — implementation & CI verification.** Controlled workspace, Docker and Git deployment tools are added, with write access opt-in and gated by OAuth scope, admin approval and a separate local broker. **Docker/Compose packaging, VPS deployment and a live ChatGPT connection remain incomplete.** Do not expose this development build publicly.

## Included in Phase 03

- Official MCP TypeScript SDK v2; stateless Streamable HTTP at `POST /mcp`.
- OAuth authorization server discovery, protected-resource metadata, dynamic client registration restricted to a configured exact redirect-URI allowlist, authorization code + PKCE-S256, access token and rotating refresh token.
- Small HTML/CSS/vanilla-JS dashboard. Admin password verified with scrypt; HttpOnly SameSite cookie, secure cookie over HTTPS, CSRF-protected controls, login failure throttling.
- Dashboard overview: MCP enable/disable switch, tool allowlist, system metrics, registered clients, active token counts, recent audit entries and logout.
- `vps:read` scope gate on every MCP HTTP request; the two original system tools remain read-only. Optional `vps:write` scope and single-use approval gates are introduced in Phase 04.
- No arbitrary shell execution or Docker daemon socket in the MCP HTTP process. Phase 04 adds limited, explicitly approved broker operations.
- Config requires a native TLS certificate/key to bind publicly. For an HTTPS tunnel/reverse proxy, bind only to loopback and declare its externally accessible HTTPS origin.
- Audit JSONL with redacted/fixed event fields; client IDs and hashed rotating refresh tokens persisted in a gitignored 0600 state file. Admin sessions reset on restart.

## Phase 04 — Controlled operations

The existing **compact, login-verified dark UI** is preserved. A small Pending Approvals section lets the admin approve or deny one operation at a time. Approved operations expire after 5 minutes and are single-use.

| MCP tool | Capability | Gate |
| --- | --- | --- |
| `system_status`, `disk_usage` | Existing system checks | OAuth `vps:read` |
| `workspace_list`, `workspace_read` | Limited list/read within an explicit workspace | Tool allowlist + read root |
| `docker_status` | Sanitized status of an allowed container | Tool allowlist + restricted broker |
| `deployment_status` | Revision + dirty-file count for a fixed repo | Tool allowlist + restricted broker |
| `operation_request` | Propose create-only file, container restart or Git sync | OAuth `vps:write`, write flag |
| `operation_execute` | Execute that *exact* operation after panel approval | One-time approval + broker |

**Default remains read-only.** The write tools are disabled unless `MCP_ENABLE_WRITES=true`, both approval tools are explicitly permitted in `MCP_ALLOWED_TOOLS`, the client has `vps:read vps:write`, the logged-in admin approves through CSRF-protected UI and the broker is reachable.

### Broker separation

`src/broker/` provides a Unix-socket server with a private socket path, 32+ character shared secret, structured command validation and resource allowlists. It does not accept freeform shell strings. File creation is exclusive and limited to a configured workspace (max 16 KiB). Container restart is limited to named containers. Git sync is **further disabled** unless `MCP_ALLOW_GIT_SYNC=true` and a trusted Git repo/branch is configured.

Example **development-only** config, after the local admin hash has been generated:

```dotenv
MCP_HOST=127.0.0.1
MCP_ALLOWED_TOOLS=system_status,disk_usage,workspace_list,workspace_read,operation_request,operation_execute
MCP_ENABLE_WRITES=true
MCP_READ_ROOT=/absolute/private/workspace
MCP_WRITE_ROOT=/absolute/private/workspace
MCP_BROKER_SOCKET=/absolute/private/run/broker.sock
MCP_BROKER_SECRET=<unique-32-plus-character-random-secret>
MCP_ALLOW_GIT_SYNC=false
```

For separately run services, launch `npm run broker` using a dedicated restricted OS identity and `npm run dev` under a separate unprivileged account with access to the socket. The socket **parent directory must be private (0700)**; configure controlled OS group/ACL access during Phase 05. Avoid giving the web application Docker daemon access. **Do not use the example directly in a production environment.**

**Risk warning:** Membership in the Docker group is effectively root-equivalent; a separate broker alone is not a sufficient production sandbox. Production broker isolation, TLS and VPS verification are Phase 05 work. See [Phase 04 Status](docs/PHASE-04-STATUS.md) and [Security](docs/SECURITY.md).

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
| `/api/approval` | Admin session + CSRF, approve/deny one pending operation |
| `/mcp` | OAuth bearer token with `vps:read` |
| `/.well-known/oauth-protected-resource` | OAuth protected resource discovery |
| `/.well-known/oauth-authorization-server` | OAuth AS metadata |
| `/oauth/register`, `/oauth/authorize`, `/oauth/token` | OAuth PKCE lifecycle |

### Production-facing remote configuration (not yet deployed)

Two possible HTTPS arrangements:

1. **Native HTTPS**: `MCP_HOST=0.0.0.0` + `MCP_PUBLIC_URL=https://your-hostname[:port]` + cert/key paths. Bind only after access controls, DNS, TLS and firewall review.
2. **Loopback + trusted HTTPS reverse proxy/tunnel**: keep `MCP_HOST=127.0.0.1`; set `MCP_PUBLIC_URL=https://your-hostname`. Terminate TLS at the trusted gateway and forward to the loopback service; preserve the correct external Host value.

In either case, put the **exact redirect URI** from the ChatGPT connection UI into `OAUTH_ALLOWED_REDIRECT_URIS`. ChatGPT generally requires OAuth rather than a manually supplied static API key. The user must log into the panel and explicitly approve the requested read/write scope during OAuth authorization. <https://developers.openai.com/plugins/build/auth>

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
│   ├── security/{authentication.ts,oauth.ts,authorization.ts,audit.ts,approvals.ts}
│   ├── tools/{system.ts,filesystem.ts,docker.ts,deployment.ts}
│   ├── broker/{client.ts,server.ts,protocol.ts,main.ts}
│   └── shared/config.ts
├── config/permissions.example.json
├── tests/{config.test.ts,mcp.test.ts,persistence.test.ts,phase04.test.ts}
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
| 04 | Scoped files/Docker/Git tools, restricted broker, explicit approval, tests | Implemented, CI verified |
| 05 | Hardened Docker build, Compose, installer, VPS verification and ChatGPT integration test | Not started |

## License

Not yet selected; a public GitHub repository does not by itself grant a redistribution license.
