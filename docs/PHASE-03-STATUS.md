# Phase 03 — Authentication, Remote Security, Permissions & Compact Panel

**State:** COMPLETE — Phase 03 source implemented and GitHub Actions verified on 2026-10-28 UTC (source tests only; no live VPS or ChatGPT integration).

## Delivered
- Official MCP SDK Streamable HTTP retained; 2 read-only MCP tools unchanged.
- OAuth 2.1 discovery metadata, exact callback allowlist, dynamic client registration, authorization code + PKCE-S256, short-lived access tokens, rotating refresh tokens and token revocation.
- Admin login via scrypt password-hash verification, bounded login attempts, HttpOnly SameSite cookie, secure cookie flag behind HTTPS, CSRF checks and logout.
- Pure HTML/CSS/JS responsive control panel: login, status metrics, MCP enable/disable, tool list, client/token counts and recent audits.
- Protected MCP endpoint checks OAuth scope `vps:read` and exact resource audience per request.
- Request size checks, security headers, Host/Origin checks, narrow read-only tool allowlists, OAuth rate limiting and bounded audit reading.
- OAuth clients and refresh-token hashes persisted with a 0600 local JSON file; audits written to JSONL.

## Scope lock
No shell/terminal execution, filesystem writes, Docker socket/control or deployment modifications. The existing Phase 02 read-only tools remain. No modifications to the user's VPS or ChatGPT connection were performed.

## Verification
- GitHub Actions: **9 tests passed, 0 failed** in the last code+test run.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Real MCP SDK client tested OAuth-secured `tools/list` and tool calls, as well as invalid-path/authorization cases.
- Added persisted OAuth registration tests and 0600 state file permission checks.
- Final documentation/Host-validation commit triggers another CI run; verify its status before deploying.

## Known limits
- External DNS/TLS/certificate renewal, live ChatGPT connection and actual fresh VPS testing are NOT complete; these are Phase 05 release gates.
- Dockerfile and Compose are still intentionally disabled.
- The OAuth server is a compact self-hosted implementation. Independent security review and deeper abuse protection are recommended before public production exposure.
- Admin sessions and access tokens reset on restart; OAuth refresh token hashes and client registrations persist.
- The admin panel kill switch is in-memory (resets to enabled on restart).
