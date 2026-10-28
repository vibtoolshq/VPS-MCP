# VPS-MCP — Sidebar Dashboard & Network Management

## UI architecture

The Control Panel uses lightweight vanilla JavaScript, CSS and HTML. After a verified admin login you will see a small, responsive sidebar:

| Page | Features |
| --- | --- |
| Overview | MCP state, endpoint, tool/client/token counts, system metrics, master switch and enrollment |
| Tool access | Every known MCP tool, global ON/OFF controls, hard-locked capabilities |
| Operations | Configured write gate and per-operation approvals policy |
| Clients | Registered OAuth clients, `vps:read` and `vps:write` policies, per-tool restrictions, revoke |
| Approvals | Explicit, time-limited per-operation allow/deny; disabled when writes not configured |
| Domain & SSL | Read-only active state, validated domain/port/SSL draft, DNS probe, private port apply command |
| Security audit | Recent audit events and client-side filter |

Desktop layout: ~202px sticky sidebar, compact content area. Mobile layout: horizontal scrollable sidebar menu. No UI framework, remote assets, font dependency or client-side privilege escalation is introduced.

## Network settings: exact semantics

| Control | Actual behavior | Does not do |
| --- | --- | --- |
| Current origin/host binding/ports | Reads the runtime config from the server | Does not probe the public internet |
| Domain draft | Validates an ASCII DNS hostname and stores it in private state | Does not modify DNS or verify ownership |
| SSL plan | `private-only` or `external-https` intent, stored in private state | Does not issue/revoke certificates or start a TLS proxy |
| Private host port | Store a port from 1024–65535 | Does not restart the host on click |
| DNS diagnostics | Read-only public DNS A/AAAA resolution of saved domain | Does not verify TLS chain or ownership |
| Apply private host port | Explicit `scripts/apply-network.sh` in a trusted SSH session | Will not bind to 0.0.0.0 or open firewall ports |

Backend endpoints:

```text
GET  /api/status                  # network.applied + network.draft; authenticated
POST /api/network/plan           # admin session + CSRF; writes only validated draft
GET  /api/network/dns            # admin session + rate limit; DNS-only check
```

Example request body (do not use curl with a live CSRF token on shared systems):

```json
{"domain":"mcp.example.com","hostPort":3300,"sslMode":"external-https"}
```

The actual `mcp.example.com` gateway is NOT created by this request. The current automatic Compose installer still runs a private, read-only MCP at localhost, using an internal container port 3000.

## Apply a private host port

1. Sign in to Control Panel through the SSH tunnel.
2. Open **Domain & SSL** and enter a desired free host port, e.g. **3300**. Keep SSL mode **Private SSH only** unless recording a separate HTTPS project.
3. Select **Save network plan** and confirm the warning.
4. From the VPS SSH shell, run `sudo bash scripts/apply-network.sh`.
5. If the helper succeeds, recreate the **PC** SSH port forward with `ssh -N -L 3000:127.0.0.1:3300 ubuntu@YOUR_VPS_IP`.
6. Open your PC browser at `http://127.0.0.1:3000`. Confirm login, DNS status and permissions.
7. If the helper fails its health check, it tries to restore the prior `.env`/Compose binding; inspect logs before another change.

`MCP_BIND_PORT` sets only the Docker **host** loopback binding. `MCP_PORT=3000` and `MCP_PUBLIC_URL=http://127.0.0.1:3000` continue to describe the **internal** application. Never set `MCP_PRIVATE_CONTAINER=false` or map `0.0.0.0:3000` to work around a mismatch.

## SSL and domain deployment prerequisites

Production HTTPS requires a separately reviewed, trusted gateway with domain ownership, DNS, TLS certificate issuance/renewal, an external canonical OAuth issuer, approved exact callback redirects and live AI client verification.

The sidebar intentionally **does not** claim that saved domain, DNS resolution or an SSL plan means ChatGPT can connect. Current private Compose remains SSH-only. See the main [README](../README.md#12-connecting-chatgpt-or-another-ai-client).

## Data safety and tests

The settings draft resides in the private Docker volume at `/data/network-draft.json` (mode 0600). A malformed or permissive existing state file is rejected on startup. Storage writes use a randomized exclusive temporary file and atomic rename. The draft is included in private backup and restore. Admin API tests cover unauthorized/CSRF requests, malformed hostnames/ports, persistence and no misleading live HTTPS state; sidebar interaction tests cover routing and draft action controls.

## Security boundary

**The web API has no Docker socket.** It cannot apply Compose port binding or configure public DNS/SSL directly, and should not acquire host-root permissions just to make a UI button work. Host apply is an explicit, auditable operator step with rollback. Domain/TLS rollout remains a separate release gate.
