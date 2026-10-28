# VPS-MCP — Five-Phase Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 01 | Project scaffold and documentation | Complete |
| 02 | Read-only MCP core, validation, tests | Complete |
| 03 | OAuth, login panel, HTTPS configuration, permissions and audit | Complete |
| 04 | Scoped files/Docker/deploy tools, broker, write approval, tests | Implemented; CI verified |
| 05 | Automatic private Compose install + first-login admin setup, then live VPS/HTTPS/ChatGPT verification | Private profile implemented; live verification pending |

## Phase 04 release gate

- `npm run check` (typecheck, tests, build) passes in GitHub Actions.
- No unrestricted shell interface.
- No Docker socket in MCP web application.
- Only configured workspaces, allowlisted container names and repository are permitted.
- OAuth read scope alone cannot trigger writes; write scope, admin consent, panel approval and broker required.
- Replay/cross-client/CSRF and unsafe path tests pass.

## Final source audit before Phase 05

Phase 01–04 source code passed the final [forensic audit](FINAL-FORENSIC-AUDIT-2026-10-28.md) and **38 automated tests**. These results do not authorize production deployment. Broker privilege separation, deterministic dependencies, HTTPS/ChatGPT compatibility and actual VPS testing are mandatory Phase 05 release gates.

## Next — Phase 05

Harden broker permissions with least-privileged OS deployment, review Docker group risks, package a small Docker image, install services and persistent secret storage, provide start/stop/remove, verify behavior on the user's fresh Ubuntu VPS and connect to ChatGPT using HTTPS/OAuth. Existing notes and data must survive upgrades.

## Private Docker profile

The default private Compose stack and one-time setup installer are documented in [PHASE-05-PRIVATE-INSTALL.md](PHASE-05-PRIVATE-INSTALL.md). Docker/Git broker and public HTTPS remain disabled pending a least-privileged integration review.
