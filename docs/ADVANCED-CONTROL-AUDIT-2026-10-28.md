# Advanced Control Console — Forensic Audit (2026-10-28)

**Repository:** `vibtoolshq/VPS-MCP`  
**Baseline:** `b3d421e685f44ef628e9302e257e515324773b7c`  
**Audit scope:** Advanced dashboard, runtime global/client tool policies, OAuth read/write access, client revocation, write operations, pending approvals, persistence, and integration/regression tests.

## Scope lock

Changed only advanced-control-related code, UI, tests and documentation. Existing login verification, read-only system tools, broker command allowlists, Docker configuration and VPS state were preserved. No VPS deployment or public connector was attempted.

## Findings and root-cause patches

| ID | Severity | Root cause | Patch / result |
| --- | --- | --- | --- |
| ADV-01 | High | A client disabled by the administrator's read policy still passed HTTP bearer authentication; only MCP tool registration rejected it | Deny at `POST /mcp` with HTTP 403 when the client read policy is off. |
| ADV-02 | High | Pending write approvals did not compare against *current* operation/client policy | Reject stale approvals with 409 when write tools, action type or client write scope has been disabled; denial remains possible. |
| ADV-03 | Medium | Revoking a client left its pending approval queue entries in memory | Remove all pending/approved non-executing requests for the client during revoke. |
| ADV-04 | High | OAuth client revocation mutated RAM before persisting; a failed state-file write could resurrect the client on restart | Persist a proposed client/refresh-token snapshot first, only then revoke in-memory tokens, grants and client registration. Regression test simulates state-write failure. |
| ADV-05 | Medium | `enabled` conflated client preference, global switches, OAuth scope policies and effective rights | Separate saved preference (`enabled`), availability (`configured`), global policy and effective permission (`effective`) in policy snapshots. |
| ADV-06 | Medium | Write gate showed effective availability rather than manual paused state | UI now uses `writeGatePaused` for the switch and `writeEffective` for actual availability, with separate explanatory text. |
| ADV-07 | Medium | Individual client tool toggles became unavailable when the global tool was off, obscuring saved client preferences | Keep the configured client's saved override editable; globally locked tools cannot be enabled. |
| ADV-08 | Low | Client scopes displayed write as disabled when read was off, even if write preference remained on | Expose and display policy preference separately from effective read/write permissions. |
| ADV-09 | Medium | Per-client policy storage had no strict new-entry cap | Bound client override records and scope restrictions to at most 32 IDs; reject overflow. |
| ADV-10 | Low | The client tool list expanded detail pane collapsed on refresh | Remember expanded client IDs while status UI re-renders. |
| ADV-11 | Medium | UI showed Approve for pending operations disabled by policy | Include operation type in pending entries; disable Approve in UI, recheck on server. |
| ADV-12 | Medium | Revocation could be committed successfully but cleanup of an orphaned client-policy record could fail, returning misleading error | Report successful revocation with a sanitized cleanup warning; preserve a security audit error and avoid falsely saying the client is active. |

## Verification strategy

- Typecheck and full Node test suite with actual MCP SDK client and HTTP admin APIs.
- Negative tests for HTTP read-policy 403, disabled operations and stale admin approval 409.
- OAuth registration/token revocation and persistence-failure regression.
- Policy preference/effective state, restrictions across process recreation, capacity bounds, and invalid environment tool escalation.
- Simulated browser UI tests covering toggles, CSRF, session expiry, login, logout and disabled-state feedback.
- npm runtime and development advisory audit, threshold high.

Consult the current [GitHub Actions](https://github.com/vibtoolshq/VPS-MCP/actions) for the **final HEAD commit CI status**; a report commit also triggers checks.

## Accepted limitations / production blockers

- A UI setting **cannot override** `MCP_ALLOWED_TOOLS`, `MCP_ENABLE_WRITES=false`, broker configuration, path roots, allowlisted Docker containers or Git sync opt-in.
- OAuth tokens still require the actual `vps:read` / `vps:write` scope; an admin policy preference is never a replacement for OAuth consent.
- Admin approval remains single-use. Changing policy before execution is rechecked at execution.
- A 403 while a read-disabled client is connected may require reauthentication or reconnecting the MCP client after permissions are restored.
- Control-file settings are local to one Node process. Clustered/multi-node synchronization, atomic cross-file revocation cleanup, tamper-evident audit logs and full disaster recovery are not implemented.
- Policy persistence uses a private file and atomic rename but has not been penetration-tested against a hostile local process capable of modifying private directories.
- The Docker broker may have root-equivalent daemon privileges and still needs Phase-05 isolation review; public HTTPS/OAuth compatibility, actual VPS deployment, browser accessibility tests and live ChatGPT connection remain unverified.
- The console only manages capabilities in the current MCP implementation; **it is not full root/SSH/firewall/host administration**.

**Conclusion:** The identified advanced-control implementation defects were patched and are being verified by GitHub CI. This is not a claim that all possible bugs are eliminated or that the service is production-safe.
