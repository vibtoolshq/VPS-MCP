# Phase 03 — Authentication, Remote Security, Permissions & Compact Panel

**State:** IMPLEMENTED; final CI verification required before calling the phase closed.

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
Inspect the most recent GitHub Actions workflow after this status report commit: it runs `npm run check` (typecheck, unit/integration tests, build). Includes a real MCP SDK client calling OAuth-secured tools and negative authorization tests.

## Known limits
- External DNS/TLS/certificate renewal, live ChatGPT connection and actual fresh VPS testing are NOT complete; these are Phase 05 release gates.
- Dockerfile and Compose are still intentionally disabled.
- The OAuth server is a compact self-hosted implementation. Independent security review and deeper abuse protection are recommended before public production exposure.
- Admin sessions and access tokens reset on restart; OAuth refresh token hashes and client registrations persist.
- The admin panel kill switch is in-memory (resets to enabled on restart).
