# Phase 04 — Controlled VPS Operations

**State:** Implementation verified by GitHub Actions. Final deployment verification is reserved for Phase 05.

## Scope delivered

- Existing Phase 03 OAuth, admin login, session/CSRF, audit and responsive control panel preserved.
- `workspace_list` and `workspace_read`: bounded, read-only filesystem access inside configured root; refuse dotfiles, traversal, symlinks and files larger than 64 KiB.
- `docker_status`: sanitized allowlisted container state queried only by a separate Unix-socket broker.
- `deployment_status`: configured repository revision and dirty-file count via broker.
- `operation_request`: propose one of `file.create`, `docker.restart` or `deploy.sync` (no side effect).
- `operation_execute`: consumes one exact operation after admin approval via the panel, using an opaque ID bound to the OAuth client and expiring after 5 minutes.
- `vps:write` OAuth scope only when `MCP_ENABLE_WRITES=true`; read scope remains mandatory.
- Broker endpoint uses private Unix socket, shared secret and revalidates operation structure + resource allowlists. No generic command or shell input.
- Deployment sync requires the additional `MCP_ALLOW_GIT_SYNC=true` flag, an allowlisted branch, clean checkout, trusted origin and fast-forward-only pull; no build hooks are intentionally executed.
- Approval cards in compact panel with CSRF-protected Approve / Deny controls, audit events and single-use execution.

## Security defaults

- No broker socket or Docker host socket exposed to MCP by default.
- No extra MCP tools enabled by default. `MCP_ALLOWED_TOOLS` remains `system_status,disk_usage`.
- `MCP_ENABLE_WRITES=false` and `MCP_ALLOW_GIT_SYNC=false`.
- Write operations unavailable without explicit config, authenticated write-scoped client, admin approval and live broker.
- The broker must run under a **separate least-privileged OS identity** and access only explicitly allowed resources. A user with Docker daemon access may effectively have root-level privileges; do not grant broadly.

## Verification

- GitHub Actions executes `npm run check`: TypeScript typecheck, automated tests, JS build.
- Added tests for path traversal, symlinks, hidden files, overwrite denial, broker secret rejection, Docker and deployment allowlist failures, approval replay and cross-client denial.
- E2E: OAuth code exchange with `vps:read vps:write`, MCP SDK operation proposal, panel CSRF approval, broker-created file, replay rejection, separate read-only client's write denial.
- Docker restart and Git sync are not executed against live infrastructure in CI. They require fresh VPS verification.

## Explicitly out of scope

No unrestricted terminal, `docker exec`, `docker run`, privileged container creation or arbitrary deployment scripts. No production Docker Compose deployment, DNS/TLS setup or live ChatGPT connection. Phase 05 will supply the tested least-privileged service packaging, operations and clean uninstall.

## Relevant paths

`src/broker/` (server/client/protocol), `src/security/approvals.ts`, `src/tools/` (restricted operations), `public/panel.*`, `tests/phase04.test.ts`.
