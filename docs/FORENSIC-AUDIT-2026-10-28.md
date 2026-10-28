# VPS-MCP — Forensic Audit Report

**Audit date:** 2026-10-28  
**Project:** `vibtoolshq/VPS-MCP`  
**Scope:** Phase 01–04 repository source, package manifest, TypeScript MCP/HTTP, OAuth, admin UI, audit subsystem, filesystem tools, broker, Docker/Git operation gates, existing tests, security documentation and GitHub Actions.  
**Method:** Threat-model review, targeted static analysis, CI-based source/runtime integration tests, negative security cases and npm advisory audit. No production VPS changes were made.

## Baseline

- Source on `main` before patches: `cfa3fc15dfc88d1294b442844755995e97bc650c`.
- The pre-audit GitHub CI had **13 passing tests** and a successful typecheck/build.
- `Dockerfile` is intentionally non-deployable and `compose.yaml` intentionally empty at this stage. This is expected Phase 05 work.

## Confirmed defects and patch status

| ID | Finding | Severity | Fix / verification |
|---|---|---|---|
| F-01 | MCP HTTP accepted requests without Content-Length and did not bound chunked input before SDK processing | High | Require bounded Content-Length and deny Transfer-Encoding on protected POST; existing OAuth MCP integration still passes |
| F-02 | Public OAuth dynamic client registration could exhaust the finite client-registration capacity | High | Close registration by default; admin-only 5-minute enrollment and five registrations/window; negative tests |
| F-03 | OAuth refresh token deletion was not always flushed to persistent state before an invalid-grant response | High | Persist consumed refresh-token hash state; refresh/replay regression tests |
| F-04 | OAuth authorization codes, pending requests, sessions and tokens had incomplete in-memory capacity controls | Medium | Add bounded session, authorization, registration and token capacities |
| F-05 | Admin MCP kill switch reverted to enabled on process restart | High | Persist an explicit on/off control file; invalid state refuses startup; tests |
| F-06 | Critical broker writes could execute even if audit data failed to persist | High | Durable dispatch record must succeed before broker side effects; denial test confirms broker not called |
| F-07 | Existing OAuth state files could be world-readable on startup | High | Validate private 0600-style file permissions before reading; negative test |
| F-08 | Broker socket parent directory could be a symlink | Medium | Reject non-directory/symlink socket parent with `lstat` |
| F-09 | Workspace traversal checks did not reject group/world-writable parent directories | High | Reject unsafe directory permissions and path symlinks; tests |
| F-10 | Admin login used synchronous scrypt, blocking the Node HTTP event loop | Medium | Use bounded asynchronous scrypt with at most four concurrent verifications |
| F-11 | Approval preview did not expose enough information for manual file-content review | Medium | Add bounded content preview and SHA-256 fingerprint to proposed write summary |
| F-12 | No vulnerability audit and limited regression cases in CI | Medium | Add high-severity npm audits, adversarial tests, and static UI consistency test |

**This list identifies issues discovered during this audit, not an assertion that every possible defect has been eliminated.**

## Scope boundary retained

- No arbitrary terminal/shell executor.
- No Docker daemon socket inside the HTTP/MCP process.
- Read-only MCP tools remain default; writes require explicit configuration, OAuth `vps:write`, user/admin consent and single-use approval.
- No Dockerfile/Compose production installation or VPS deployment in this forensic pass.

## Remaining known risks / Phase 05 release blockers

1. **Privileged Docker control:** Docker daemon access is effectively root-equivalent. The separate broker restricts commands, but full least-privileged broker isolation and installation must be reviewed on a real VPS.
2. **Broker credential design:** A compromised web process that can read the broker secret may bypass its own approval UI and request allowlisted operations. Stronger isolation/approval attestations are required for higher-assurance deployments.
3. **Filesystem race conditions:** Node path checks and `O_NOFOLLOW` reduce risk, but complete race-free containment against malicious local processes requires stronger directory-handle-based APIs or hardened private workspaces.
4. **Git sync:** Must remain opt-in and restricted to trusted repos; Git configuration, filters and fetch behavior require further production isolation testing.
5. **Remote operations:** HTTPS certificate renewal, OAuth callback compatibility with real ChatGPT accounts and reverse proxy/tunnel configuration are not yet field-tested.
6. **Supply chain:** No committed `package-lock.json`; `npm install` can resolve newer transitive versions. A deterministic lockfile + `npm ci`, release artifacts and pinned Actions digests should be added before production release.
7. **UI:** Static DOM consistency is tested, but interactive browser accessibility/visual tests on desktop/mobile and external OAuth redirect flows are still pending.
8. **Resilience:** In-memory OAuth access tokens and pending approvals reset on restart; multi-process clustering, persistent queues, rotating audit logs, alerting and recovery flows are not implemented.

## Verification

- GitHub Actions: TypeScript strict typecheck, source build and MCP SDK integration tests.
- Extended cases: authorization callback allowlist, login/CSRF, read-only tool denials, broker credential rejection, approval replay, filesystem symlink/traversal/permissions, durable auditing, client-enrollment caps, restart control state, private OAuth file modes, and UI DOM IDs.
- Dependency advisory gate: `npm audit --omit=dev --audit-level=high` and `npm audit --audit-level=high`.
- The latest successful CI run should be checked on the repository's [Actions page](https://github.com/vibtoolshq/VPS-MCP/actions). A GitHub CI success is **not** proof of actual Ubuntu VPS installation safety.

## Decision

**Phase 01–04 source is suitable for continued development and the controlled Phase 05 deployment-hardening process. It is not yet certified or verified for public, unrestricted VPS management.** Keep the project private to a trusted operator until release controls and real-world verification are complete.
