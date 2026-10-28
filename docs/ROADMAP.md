# VPS-MCP Roadmap (five phases)

| Phase | Scope | State |
|---|---|---|
| 01 | Structure, README, architecture and security design | Complete |
| 02 | Read-only MCP core, Streamable HTTP, status tools and tests | Complete |
| 03 | OAuth authorization code/PKCE, verified admin login, allowlisted permissions, audit, HTTPS support and compact control UI | Implemented; CI must pass |
| 04 | Controlled filesystem/Docker/deployment operations, isolated broker, approvals and negative tests | Not started |
| 05 | Small hardened Docker image, Compose, reusable installer/stop/uninstall, fresh Ubuntu VPS and real ChatGPT connection testing | Not started |

## Phase 03 gates

- TypeScript check + build
- Unit and protocol tests: credential checks, Host/Origin, OAuth discovery, callback allowlist, authorization code flow, refresh rotation, signed-in admin/CSRF, permission and kill switch
- No host shell, file write or Docker privilege
- Read-only state persists in disk storage where appropriate
- Scope clearly distinguishes CI validation from real VPS/ChatGPT integration

## Future operations

Do not reconfigure an existing VPS, public firewall, DNS or ChatGPT connection in Phase 03. Phase 04 focuses on constrained operations; Phase 05 delivers deployment and verification. 
