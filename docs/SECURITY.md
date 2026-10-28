# Security Policy and Threat Model

**Status: design notes; controls are not implemented.** Do not expose or deploy this scaffold as a production MCP endpoint.

## Threats
Untrusted MCP requests, forged identities, prompt injection, path traversal, secret leakage, accidental destructive actions, malicious repository content, and Docker socket privilege escalation.

## Controls planned
- Authenticated TLS or access-controlled tunnel; no public unauthenticated port
- Verify identity and scope on every tool call; default-deny policies
- Non-root container, minimal Linux capabilities, read-only filesystem where possible
- Explicit canonical path allowlists; secrets excluded from tool responses and logs
- Structured audit logs with redaction and request correlation IDs
- Request sizes/timeouts/rate limits and tool input schemas
- Brokered and narrowly scoped privilege for write actions; no direct unrestricted Docker socket
- Tests for authorization bypass, traversal, hostile inputs and kill-switch behavior

## Secrets
Never commit tokens, private keys, credentials, or populated `.env` files. Prefer a secret store or appropriately protected runtime environment. Rotation and revocation must be documented before release.
