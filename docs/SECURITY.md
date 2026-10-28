# VPS-MCP Security Policy — Phase 05 Private Profile

This is a **CI-tested private Docker Compose profile, not yet a publicly tested or hardened production MCP deployment**. The installer generates a unique one-time setup token; anonymous default admin/password login is forbidden. The web container has no host Docker socket.

## Implemented safeguards

- OAuth authorization-code + PKCE, audience/scope validation, refresh token rotation; exact callback URI registration allowlist.
- Admin verified login, asynchronous/bounded scrypt password checks, HttpOnly SameSite/Secure cookies, CSRF, in-memory session cap and login throttling.
- HTTPS guard for non-loopback listeners, Host/Origin verification, restrictive browser security headers.
- Default-deny tool allowlist. `vps:write` scope only when explicitly enabled. Each write operation requires one logged-in admin approval, a single-use approval ID and an active broker.
- Broker uses private Unix-domain socket (not public network) plus secret. It revalidates every action, path/container/repo target, and runs fixed commands with `execFile`, never a shell string.
- Files are confined to a configured workspace; hidden paths, symlinks, traversal and group/world-writable directories rejected; writes are create-only / no-overwrite / 0600.
- Docker host socket is not mounted in or accessed by the HTTP MCP process.
- Git synchronization is disabled separately by default; only a fixed repository, branch, trusted remote and fast-forward-only pull are supported.
- Sanitized audit events for authorization, approvals, executions and MCP activity. Broker dispatch is refused when critical audit writing fails.
- New OAuth client registration is closed by default, requires an admin-opened 5-minute window and is capped per window.
- MCP disable is persisted to a private control file so a restart does not silently re-enable it.

## Safety-critical caveats

- **Docker group access is effectively root-equivalent.** Running the broker with Docker daemon permissions has serious implications; use a constrained proxy and separate OS identity before production, with only approved containers.
- **Current 0700 socket-directory / 0600 socket defaults only permit a matching OS identity**; separate-user production deployment requires reviewed group/ACL setup in Phase 05.
- **Unix socket + shared secret is not an independent admin-approval authority.** A compromised HTTP service holding the secret could bypass its approval UI and directly request allowlisted broker operations. Run the broker with the least capabilities possible; Phase 05 must review isolation, token boundaries and permission separation.
- A filesystem writable by an untrusted local process can change between path validation and write (TOCTOU). Use a private workspace owned by the broker identity; more robust openat-style protections may be required.
- `deploy.sync` runs Git inside a trusted repository; Git config/filters and downloaded content can present code execution risks even if client input is fixed. Do not enable it for untrusted repositories. Build/restart are not automatically chained to sync.
- CI does not exercise real Docker restarts or real Git sync on a VPS. No live ChatGPT connection has been verified.
- Audit JSONL is local, not tamper-evident or rotated. Approval state, access tokens and sessions reset on restart; OAuth clients/refresh hashes persist.
- Broker requests can be initiated by any local process with both socket access and secret; do not share credentials or socket permissions beyond trusted service identities.
- Stronger rate limits, independent review, fail-closed deployment controls and production TLS/proxy hardening remain for Phase 05.

## Secrets

Do not commit `.env`, broker secret, private keys, passwords, OAuth codes/tokens or populated data files. Use random secrets with at least 32 characters and restricted file permissions. Revoke affected credentials after any compromise.

## Reporting

Report exploitable issues privately to maintainers without publishing credentials or sensitive details.
