# Implementation Roadmap

| Phase | Deliverable | State / exit gate |
| --- | --- | --- |
| 01 | Structure, README and security design | Complete |
| 02 | Official SDK v2, local Streamable HTTP, health, read-only system tools, schema validation and tests | Implemented; CI checks must pass to verify |
| 03 | Authenticated remote connection, HTTPS/tunnel, authorization, audit, negative security tests | Not started |
| 04 | Optional tightly constrained filesystem, Docker and deploy operations; isolated execution broker and approval controls | Not started |
| 05 | Portable hardened image/Compose, installer, stop/uninstall, CI, real VPS verification | Not started |

## Phase 02 acceptance

- `npm run check` typechecks, builds, runs tests.
- Only `127.0.0.1` bind is permitted.
- `/health` and MCP `tools/list` plus `tools/call` work locally.
- Tools are read-only; invalid arbitrary paths are rejected.
- No unauthenticated remote endpoint or privileged Docker access.

**Important:** Committing the source does not alone prove acceptance. Verify GitHub Actions and/or an independent local run before closing the phase.

## Release constraints

No public deployment or remote ChatGPT setup until Phase 03 security controls. Don't promise zero cost or compatibility with every ChatGPT account.
