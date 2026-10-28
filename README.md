# VPS-MCP

A lightweight, portable **Node.js + TypeScript MCP server** with an OAuth-secured, permission-controlled API and a clean, responsive, login-verified web control panel. Intended for Ubuntu VPS management via compatible MCP clients.

> **Phase 05 private deployment foundation:** An isolated, localhost-only Docker Compose stack with automatic `.env` and mandatory first-visit admin setup is implemented. Public HTTPS, privileged broker isolation and a live ChatGPT connection are **not** yet verified.

## Final security and deployment verification

The final repository audit included dependency locking, first-setup ownership recovery, Docker volume-loss safety and restore testing. The default release is intentionally **private and SSH-forwarded**. Container isolation, encrypted SSH transport, user-owned credentials and opt-in MCP permissions are enabled by default.

Install with `bash scripts/install.sh` (no manual `.env` editing). For a consistent private backup, run `bash scripts/backup.sh`; verify with `bash scripts/check-backup.sh /path/to/backup`. On a **different, empty installation only**, restore with `bash scripts/restore.sh /path/to/backup`. Restore will refuse existing `.env` and Docker data volume; it never overwrites the original installation.

The full findings and remaining release constraints are in [Final Release Audit](docs/FINAL-RELEASE-AUDIT.md). **Public ChatGPT access, HTTPS gateway, privileged broker isolation and live VPS deployment are not yet verified** and must not be represented as ready.

## Zero-manual-env secure private installation

From a fresh Ubuntu VPS with Docker/Compose installed:

```bash
bash scripts/install.sh
```

Installer-generated private `.env`, a one-time setup token and a persistent Docker volume are configured automatically. **The first browser visit requires setting a new admin username and a strong password.** The familiar starter example `admin / Pass@123` is shown in the UI but **never grants access**; the password must be changed before login. Access the panel through an SSH tunnel at `http://127.0.0.1:3000`.

The default container is non-root/read-only, binds to host loopback only and does not mount a Docker socket or launch a privileged broker. **This private profile is not reachable by ChatGPT cloud connectors yet**; live public HTTPS/OAuth setup remains pending.

See [Phase 05 Private Install Guide](docs/PHASE-05-PRIVATE-INSTALL.md). Stop/update/uninstall scripts retain your state.

## Final repository forensic audit

The Phase 01–04 source code was re-audited before Phase 05. OAuth state persistence, refresh rotation, private state-file writes, symlink handling and tool resource-readiness are now covered by targeted tests. The final code CI passed **38/38 tests**, typecheck and build, with no npm high-severity advisories reported.

**Public production deployment is not yet approved.** the private Docker/Compose deployment is now available, but public/privileged deployment remains unverified and broker isolation, HTTPS/OAuth live compatibility, backups and VPS operations must pass Phase 05 verification. See [Final Forensic Audit Report](docs/FINAL-FORENSIC-AUDIT-2026-10-28.md).

## Advanced access control panel

The compact login-verified panel now includes **tool-by-tool and client-by-client access management**. It is backed by server-enforced, persistent settings—not decorative switches.

- **Global tool access:** all eight known MCP tools are shown; tools outside the configured `MCP_ALLOWED_TOOLS` ceiling are visible as locked and cannot be activated.
- **Client permissions:** list registered OAuth clients, set per-client `vps:read` / `vps:write` policy gates and individually disable/enable tools for each client.
- **Write operations:** pause the configured write gate or disable `file.create`, `docker.restart`, and `deploy.sync` individually. Existing OAuth scope, environment flags, allowlists, broker and single-use manual approval remain mandatory.
- **Lifecycle:** revoke a registered client and invalidate its active and refresh tokens.
- **Existing protections:** authenticated login, CSRF checks, master MCP stop switch, 5-minute OAuth enrollment window, audit entries, pending approvals and system statistics are preserved.

Control state is stored in **`data/policy.json`** by default, with restricted permissions. You can customize the location using `MCP_POLICY_FILE`. The independent master kill switch remains in `MCP_CONTROL_FILE`.

The advanced control policy was further audited for stale approvals, revocation persistence, client-specific read/write gates and dashboard state consistency. See [Advanced Control Forensic Audit](docs/ADVANCED-CONTROL-AUDIT-2026-10-28.md).\n\nRead **[Advanced Control Panel Guide](docs/ADVANCED-CONTROL-PANEL.md)** for the exact permission model, endpoints and limitations. The UI cannot enable unrestricted shell commands, grant root privileges, override environment hard limits, or manage system services without a separately designed privileged backend.

## Security audit after Phase 04

A post-Phase-04 source and GitHub CI audit found and addressed several issues. **New installations require admin-controlled five-minute OAuth client enrollment**, and disabling MCP in the panel now remains disabled across restarts. Password verification no longer blocks Node's HTTP event loop, critical write operations fail closed when the local audit log cannot be persisted, and unsafe workspace directory permissions are rejected.

See [Forensic Audit Report](docs/FORENSIC-AUDIT-2026-10-28.md). **This audit is not a production penetration-test certificate**: live Docker/Git execution, public TLS deployment, ChatGPT integration, and isolated broker permissions still require Phase 05.

## Included in Phase 03

- Official MCP TypeScript SDK v2; stateless Streamable HTTP at `POST /mcp`.
- OAuth discovery and PKCE, access and rotating refresh tokens. **Dynamic client registration is closed by default:** after admin login use *Open for 5 min* in the panel before connecting a new MCP client. Exact configured redirect-URI allowlist and five registrations per enrollment window.
- Small HTML/CSS/vanilla-JS dashboard. Admin password verified with scrypt; HttpOnly SameSite cookie, secure cookie over HTTPS, CSRF-protected controls, login failure throttling.
- Dashboard overview: persistent MCP enable/disable switch, temporary OAuth client enrollment, tool allowlist, system metrics, client/token counts, recent audit entries and logout.
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
| `/api/enrollment` | Admin session + CSRF, open/close OAuth client enrollment (5 minutes) |
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

**Current limits:** runtime session/auth-code caches are memory-only; persisted OAuth clients and refresh-token hashes survive restarts, but existing access tokens do not. MCP on/off status is persisted to a private control file. The audit log and state files are local disk files. Full live ChatGPT and TLS deployment testing is reserved for release verification.

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
├── Dockerfile       # non-root private runtime
└── compose.yaml     # localhost-only isolated service
```

## Planned five phases

| Phase | Purpose | Status |
| --- | --- | --- |
| 01 | Structure & documentation | Complete |
| 02 | Read-only MCP core & tests | Complete |
| 03 | OAuth, permissions, audit, HTTPS support & compact verified-login UI | Implemented, CI checked |
| 04 | Scoped files/Docker/Git tools, restricted broker, explicit approval, tests | Implemented, CI verified |
| 05 | Private Docker/Compose, auto installer, first-login setup; then live VPS/HTTPS/MCP verification | Private profile implemented; public integration pending |

## License

Not yet selected; a public GitHub repository does not by itself grant a redistribution license.
