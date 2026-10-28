# Security design and Phase 03 restrictions

## Implemented

- **OAuth:** metadata discovery, PKCE-S256 single-use authorization codes, rotating refresh tokens, token audience + expiry + scope check; exact registered callback allowlist.
- **Admin login:** password scrypt hash; no plaintext password in repository; failure throttling; HttpOnly SameSite cookie, Secure attribute when behind HTTPS; short-lived in-memory sessions; CSRF on control mutations.
- **Transport:** localhost binding by default. Non-loopback binding requires native TLS certificate/key plus public HTTPS origin. Origin and Host checks, strict CSP, no CORS exposure and no-store security headers.
- **Tool permissions:** allowlist permits only `system_status` and `disk_usage`, with exact disk-path validation. No Docker socket, arbitrary shell, privileged tools, write actions or file-read endpoint.
- **Audit:** allowlisted event categories, bounded sanitized actor/detail, JSONL without credentials or request payloads.
- **Kill switch:** authenticated CSRF-protected panel action can reject all MCP API requests while keeping admin login available.

## Known boundaries / hardening still required

This is **not a claim of production-ready hardening**. Do not deploy to the public internet without further review:
- Public OAuth register/token endpoints have basic per-IP rate limiting; stronger distributed abuse controls and resource quotas are still needed.
- Short-lived access tokens and admin sessions are memory-only; refresh token hashes and client registrations persist in a local 0600 file.
- Audit logs are append-only locally, without centralized tamper resistance or rotation.
- Remote live ChatGPT callback and TLS certificate renewal are untested.
- Native HTTPS key permissions, reverse proxy trust and VPS firewall must be configured correctly.
- Phase 05 will package the application as a hardened non-root container and verify remote operations.

For remote deployment, enforce modern HTTPS and firewall limits. Configure exact ChatGPT redirect URI from the target connection; do not assume all ChatGPT plans permit every MCP feature.

## Secret rules

Never commit `.env`, `data/`, private keys, password hashes from a real deployment, OAuth access/refresh tokens, session cookies or registration secrets. Rotate admin credentials and revoke affected clients if compromised. API credentials do **not** belong in URL query strings.

## Reporting

Disclose security problems privately to maintainers, not through public issues with secrets.
