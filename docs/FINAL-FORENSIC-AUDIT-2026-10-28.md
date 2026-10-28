# VPS-MCP — Final Project Forensic Audit

**Date:** 2026-10-28  
**Repository:** `vibtoolshq/VPS-MCP`  
**Baseline:** `88b16ea85555a00cfd0ac1c7052abaa91c6ee26f`  
**Final audited code commit:** `252dab7e89ef64aecbc330736e542c6495d1be00`  
**Scope:** Phase-01 to Phase-04 code, UI, configuration, broker, security state and CI. Phase-05 production deployment was deliberately not implemented.

## Executive decision

**Source QA status: PASS for continued Phase-05 engineering.**  
**Public production deployment: NOT READY / NOT VERIFIED.**

At the final code commit GitHub Actions run `40753807804` completed successfully:
- TypeScript strict typecheck: **pass**
- Node automated and MCP integration tests: **38 passed, 0 failed**
- Compiled JavaScript build: **pass**
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities reported**
- `npm audit --audit-level=high`: **0 vulnerabilities reported**

A passing CI or advisory scan does not mean all defects or exploits are absent. No live VPS or ChatGPT server connector was accessed during this audit.

## Areas inspected

| Subsystem | Review focus | Assessment |
| --- | --- | --- |
| Architecture and project tree | File boundaries, port/runtime, default security | Phase 01–04 implementation present; Phase 05 packaging intentionally inactive |
| Config/permissions | Default deny, environment ceilings, roots, broker settings | Safe defaults; resource-readiness bug patched |
| Admin authentication | scrypt, login limits, secure cookies, sessions, CSRF | Existing tests pass; live HTTPS cookie behavior pending |
| OAuth | Client registration, PKCE, scopes, state, access and refresh tokens, revoke | Persistence bugs patched; production OAuth compatibility pending |
| HTTP/MCP | Auth gate, Host/Origin validation, content limits, tool exposure | Existing protocol tests pass; chunked transport compatibility unresolved |
| Global/client access controls | Per-tool, per-client, write gate, revoke, persisted policy | Existing permission tests pass; environment remains a hard ceiling |
| Operation approval | Client identity, explicit consent, expiry, single-use, audit gate | Existing negative/replay tests pass; broker trust caveat remains |
| Filesystem | Relative paths, traversal, symlinks, directory modes, size limits | Protected in configured private workspace; local race hardening remains |
| Docker/Git broker | Unix socket, fixed command schema, allowlist, no shell strings | Restricted implementation; daemon privilege and Git execution threat remains |
| Dashboard | Session expiry, toggles, status semantics, CSRF, confirmation, accessibility | Mock-DOM UI tests pass; real browser accessibility review pending |
| Supply chain | CI, npm dependency advisory scans, build reproducibility | Advisory checks pass; no committed lockfile |
| Ops/maintenance | Docker packaging, TLS, restart, backup and live client setup | Phase 05 release gates; not implemented or verified |

## Findings fixed in this final audit

| ID | Severity | Root cause | Remediation |
| --- | --- | --- | --- |
| FINAL-01 | High | OAuth registration updated the in-memory client map before persisting registration | Persist proposed registration state first, then expose registered client; simulated storage failure leaves no orphan registration |
| FINAL-02 | High | Access/refresh token issue inserted tokens in memory before disk persistence | Persist proposed refresh state before returning or exposing the new tokens |
| FINAL-03 | High | Refresh rotation previously used multiple storage transitions, risking loss/inconsistency on failure | Perform old-refresh removal and new-refresh issuance through a **single atomic persisted snapshot** |
| FINAL-04 | Medium | OAuth/control/policy state writes used predictable process-ID temp filenames, and allowed existing temporary file overwrite | Use randomized temporary names, exclusive `wx` creation, `0600` mode and best-effort cleanup |
| FINAL-05 | Medium | Existing OAuth and master control file checks followed symbolic links | Check with `lstatSync`, denying symlinked state/control files |
| FINAL-06 | Medium | Workspace/Docker/deployment tools could appear available merely because their names were in `MCP_ALLOWED_TOOLS` | Verify required resource configuration before reporting or registering a tool as effective |
| FINAL-07 | Medium | Missing negative tests for persistence failures and resource-readiness mismatches | Added simulated disk-write failure tests, symlink-control test, unavailable-tool policy tests |

### Previous audit fixes retained

The final baseline already included HTTP-level client read gate; per-client read/write tool-policy boundaries; CSRF-verified advanced admin controls; stale approval rejection; client revocation and pending approval invalidation; bounded sessions and OAuth enrollment; fail-closed broker dispatch audit; path validation and read-only default; UI confirmation, status accuracy and error handling. These were rechecked by the existing suite, not independently penetration-tested.

## Remaining release blockers and accepted risks

### P0 — must address before public production deployment

1. **No deployable production image:** `Dockerfile` deliberately exits with failure and `compose.yaml` has no services. The service is not deployable via the promised portable Docker workflow yet.
2. **Broker privilege isolation:** Docker daemon access can be root-equivalent. The broker currently accepts a shared secret held by the MCP HTTP process, meaning compromise of that process could potentially bypass its own manual-approval UI. A truly independent authorization/privilege boundary or constrained operation proxy needs a production threat review.
3. **HTTPS and live client integration:** No real DNS, certificate lifecycle, trusted reverse proxy/tunnel, OAuth callback, or ChatGPT MCP connector flow was tested. The current HTTP handler rejects chunked `/mcp` requests without `Content-Length`; actual client compatibility must be verified.

### P1 — important hardening and operational gates

4. **Git sync:** The fixed `git pull --ff-only` path is opt-in, but trusted repository config, filters, transports and source-code provenance need isolation checks. It must not run with broad host privileges.
5. **Filesystem race containment:** Validation and no-follow flags protect against common traversal/symlink paths, but not every time-of-check/time-of-use race involving another malicious local writer. Keep workspaces private and use stronger directory-handle containment if sharing is required.
6. **Deterministic dependency supply chain:** The repo has **no committed `package-lock.json`**; CI uses `npm install`, so resolved transitive dependencies may differ over time. Produce a verified lockfile and use `npm ci` for release.
7. **Audit durability/retention:** JSONL audit is local and not tamper-evident, rotated or centrally monitored. Add retention, backup, access review and failure alerting.
8. **Data lifecycle and recovery:** Verify persistence after restart/update and test backup/restore of private OAuth, policy, control and audit state. Do not reset existing local data.

### P2 — usability and resilience

9. Browser accessibility and live mobile tests are still needed beyond the mocked UI suite.
10. Auth sessions, access tokens and approval requests are intentionally in-memory and reset on restart; clustered/multi-process operation is unsupported.
11. Admin UI controls **only the implemented MCP capabilities**, not unrestricted SSH/root access, firewall changes, privileged Docker exec or full operating-system lifecycle.
12. Native server logs, runtime alerting and emergency recovery should be verified on the actual target VPS.

## Release decision and next gate

- **Phase 01–04 codebase:** tested, audited and patched for the findings listed above.
- **Phase 05:** remains open. First establish a least-privileged service/broker architecture; then produce tested Docker/Compose packaging, a repeatable installer, secrets/data volumes, TLS endpoint, backup/restore, actual fresh Ubuntu VPS test and live ChatGPT OAuth/MCP verification.
- **Production status:** **NOT READY**. Do not expose current source/broker publicly or grant Docker daemon access to the HTTP process.

**VPS side effects during audit:** None. No containers started, no firewall/SSH settings changed, and no live deployment was attempted.

[Final code CI](https://github.com/vibtoolshq/VPS-MCP/actions/runs/40753807804) · [Repository](https://github.com/vibtoolshq/VPS-MCP)
