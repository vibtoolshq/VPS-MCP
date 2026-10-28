# Advanced MCP Console — Capability & Scope Lock

**Status:** Implemented at source/CI level; not yet deployed on the user's VPS.

## Purpose

One small, login-verified admin panel controls **every tool available to this VPS-MCP implementation**, using independent global tool switches, OAuth-client-specific access restrictions, read/write scope policy, sensitive operation switches, client revocation, and the existing master MCP kill switch, consent, enrollment and audit/approval controls.

## Enforced controls

| Layer | Admin controls | Enforced by |
| --- | --- | --- |
| Server kill switch | MCP service ON/OFF | Persisted control.json; HTTP `/mcp` |
| Global tool access | 8 existing tools, independently ON/OFF | Persistent PolicyStore + runtime MCP registration/call check |
| Client tools | Each registered client: per-tool allow/deny | PolicyStore keyed by client ID + OAuth request context |
| Client scope policy | Each client: `vps:read` and `vps:write` gates | PolicyStore; OAuth token scope remains a separate prerequisite |
| Global write gate | Pause or allow *configured* write operations | PolicyStore + OAuth `vps:write` + broker approval |
| Operation types | `file.create`, `docker.restart`, `deploy.sync` | PolicyStore at request *and* execution time |
| Client lifecycle | List clients, view redirects/token count, revoke | OAuthService token/registration invalidation |
| Existing controls | Enrollment, pending approvals, audit log, status | Existing APIs and CSRF-protected UI |

## Interpreting dashboard switches

- **Configured:** the operation or tool exists in the server's validated environment allowlist.
- **On / Off preference:** the last explicit admin selection at that layer (global tool, client tool, operation type, or write-gate switch).
- **Effective access:** the combined result after environment limits, global switches, client scope, client tool override and write-gate policy. An *On* preference can correctly display **currently blocked**.
- Per-client `vps:read` and `vps:write` switches are admin-side policy gates; they never add OAuth scopes to existing tokens.
- A read-disabled OAuth client is now rejected at `POST /mcp` with HTTP 403, including when requesting `tools/list`. Revoked clients receive 401.
- Approve is disabled and the server rejects approval if the pending operation's action or client access has since been disabled. Deny remains possible.
- Client revocation removes pending requests and tokens. A rare persistent client-policy cleanup failure is reported as a warning **after** the revocation succeeds.

See [Advanced Control Forensic Audit](ADVANCED-CONTROL-AUDIT-2026-10-28.md).

## Important limitations

- **Environment allowlists are hard ceilings.** A UI switch cannot enable a tool not already listed in `MCP_ALLOWED_TOOLS` or bypass `MCP_ENABLE_WRITES=false`, file roots, Docker container allowlists, Git sync opt-in, or the broker socket requirements.
- **Client scope toggles are policy gates, not token issuance.** Enabling a client's write policy does not grant an OAuth `vps:write` token; the client still needs to complete the OAuth authorization flow with that scope.
- The approval queue remains single-use and consent-based. A previously approved operation cannot execute after its operation type or write gate is disabled.
- Revoke Client removes its registration, access and refresh tokens, pending grants and codes. Existing local client configuration may need reconnecting after revocation.
- There is **no unrestricted shell/root access, SSH credential editor, Docker exec/build, host firewall or operating-system service administration**, nor a safe method to stop/restart the web process from inside the same server. Those require independently designed privileged management and external service orchestration, not decorative UI buttons.
- In-memory access tokens and approvals reset across process restarts; persistent tool policies live in `data/policy.json`, mode 0600. Changing `.env` allowlists may require restart.
- Phase 05 still owns Docker packaging, actual VPS deployment, public HTTPS/OAuth integration and production broker privilege review.

## Current admin endpoints

All mutable endpoints require verified session cookies and `x-csrf-token`:

```text
POST /api/control/tool         {name, enabled}
POST /api/control/action       {name, enabled}
POST /api/control/writes       {enabled}
POST /api/control/client-tool  {clientId, name, enabled}
POST /api/control/client-scope {clientId, scope, enabled}
POST /api/control/revoke-client {clientId}
```

`GET /api/status` supplies `policy` and `clients` state. No secrets/tokens are returned.

## Verification gates

- Existing 23 integration/UI/security tests remain.
- New PolicyStore persistence and forbid-escalation tests, client-scope tests, CSRF and API/revocation integration, mock-browser UI toggle tests.
- CI typecheck, full test suite, build, npm advisories.
- Browser/VPS live verification remains a separate release gate.
