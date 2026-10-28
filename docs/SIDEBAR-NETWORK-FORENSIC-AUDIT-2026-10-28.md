# Latest Sidebar & Network Features — Forensic Audit

**Date:** 2026-10-28  
**Repository:** [vibtoolshq/VPS-MCP](https://github.com/vibtoolshq/VPS-MCP)  
**Baseline:** `ba1197b726237e69c0dcbfdf22c527e8aaa036f4`  
**Scope:** Latest seven-page compact sidebar; Domain & SSL plan; DNS checks; admin network API; config/Compose host-port mapping; SSH-based private port apply; state backup/restore.

## Scope lock

Only the above feature area, its regressions, the CI smoke workflow, and supporting docs were changed. Existing login, OAuth, permissions, broker/approval scope, first-visit setup, UI navigation, and Docker isolation were retained. No live VPS, firewall, DNS records, SSL certificates, other repositories or services were changed.

## Exact findings and root-cause patches

| ID | Severity | Root cause | Patch and verification |
| --- | --- | --- | --- |
| NET-01 | Medium | Status refresh unconditionally replaced the Domain/SSL form fields with saved values, losing unsaved administrator edits | Preserve input while dirty; refresh only status, keep editable draft; add browser-mock regression |
| NET-02 | Medium | DNS result could remain visible after the domain changed, falsely describing a previous DNS query as current | Clear cached DNS output on form edits, track the domain actually queried, reject stale async results, disable DNS check for unsaved drafts |
| NET-03 | High | Network draft was saved before the durable audit operation, so audit persistence failure could return failure *after* committing a change | Validate the payload and write an audit-intent record durably **before** changing the private plan; post-commit completion event is best-effort |
| NET-04 | Medium | Bad input and failed audit/private-storage writes shared HTTP 400, making a failed local service look like a malformed form | Explicit `400 invalid_network_plan` vs `503 audit_storage_unavailable` or `503 network_storage_unavailable`; UI returns actionable storage error |
| NET-05 | Medium | Multiple simultaneous host port apply processes could overwrite each other's `.env`/rollback snapshots | Guard the host-side apply helper using a stable exclusive `flock` lock; the host must have `flock` available |
| NET-06 | Medium | Earlier CI verified shell syntax but did not actually change host port in Docker | Docker smoke test switches host port **3000 → 3331 → 3000**, checks health and persisted `.env` values |
| NET-07 | Low | Standalone `127.0.0.1` listener was incorrectly displayed as “configured externally” | Report localhost binding accurately for both native loopback and private Compose mode |
| NET-08 | Low | Draft editing flags were not cleared on login/logout transitions | Reset unsaved form/DNS state on authentication view changes |

Previously fixed: network draft symlink fail-closed loading, exact validated port range, private-only Compose binding, CSRF-protected admin writes, session-protected DNS probes, and no false claim of automatically provisioned SSL.

## Security invariants

- Admin session is required to read protected network status or run DNS probes; modifying the draft additionally requires an anti-CSRF token.
- Server-side domain validation rejects malformed and local-only hostnames; port accepts only an integer 1024–65535.
- DNS diagnostics resolve A/AAAA records without fetching arbitrary HTTP URLs. DNS resolution does **not** prove ownership or HTTPS availability.
- Network plan is mode-0600 private state, stored as an atomic JSON file in the data volume; rollback from `scripts/apply-network.sh` is limited to localhost Docker host-port changes.
- `MCP_PRIVATE_CONTAINER=true` continues to keep host ingress at 127.0.0.1. The web API **does not** gain Docker socket, root or firewall access.
- Staging a domain/SSL plan **never** deploys a certificate, edits DNS or silently makes an Internet-facing MCP service.
- Docker backup and isolated restore include `network-draft.json`.

## Verification

Check the [final GitHub Actions workflow](https://github.com/vibtoolshq/VPS-MCP/actions) for the latest code commit, automated test count and Docker smoke-test result. The negative network storage tests verify that durable audit errors and private-state write failures reject the change without showing a successful applied configuration.

The success-path Docker test includes a real host mapping change and reversal on a disposable GitHub CI runner. **A separately induced port-conflict rollback was not verified**; rollback behavior still requires a controlled live rehearsal before critical production port changes.

## Unresolved limitations

1. **Domain and SSL are planning/diagnostic tools, not DNS-provider or TLS-provisioning integrations.** Public HTTPS, ACME renewals and externally accessible OAuth callbacks are still not shipped in the private Compose profile.
2. The “current port” comes from service startup configuration, not a Docker daemon socket inspection. If an operator alters Compose bindings outside the installer, verify actual host port independently using `docker compose ps` or `ss`.
3. An SSH administrator must run `sudo bash scripts/apply-network.sh`. Changing the private host port requires reconnecting the laptop tunnel with the new **remote** destination while keeping laptop source port 3000.
4. Mobile visual accessibility and real browser screenshots were not part of the source-only/UI-mock tests.
5. Live Contabo VPS installation and live ChatGPT cloud OAuth/MCP connection remain unverified. The private deployment must not be advertised as public production-ready.

**Decision:** The latest sidebar/network feature code is CI-verifiable for continued private deployment, with public domain/HTTPS management gated on a separate trusted deployment architecture and live validation.
