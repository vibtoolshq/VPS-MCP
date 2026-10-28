# Security policy

## Current stage

**Phase 02 is a localhost-only development service and NOT remotely authenticated.** The following are present:
- Bind restricted to `127.0.0.1` by Zod configuration
- Local Host and Origin header guards
- Strict tool input schemas and an explicit disk path allowlist (`/`, `/tmp`)
- Read-only system tools using Node APIs, not shell commands
- No Docker socket, root escalation, dynamic command execution, or file writes

**Never** expose the current `/mcp` port to the internet, including through SSH remote forwarding, a public HTTPS reverse proxy, or a tunnel that lacks authenticated authorization.

## Threats & remaining work (Phase 03+)

Hostile MCP requests, forged identities, malicious browser origins, request floods, prompt injection, path traversal, secrets in tool logs, privilege escalation and Docker socket abuse.

Planned controls: enforce identity and tool permissions on every request, authenticated HTTPS/tunnel with correct identity propagation, request size/time/rate limits, security audit logs, secrets management and negative security testing. Controlled privileged operations require a separately scoped execution broker.

## Reporting

Report security issues privately to the repository maintainers; do not submit secrets or exploit payloads in public issues.
