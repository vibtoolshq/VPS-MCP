# Implementation Roadmap

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 1 | Repository structure and docs | All planned paths tracked; no executable server |
| 2 | Read-only MCP core | MCP protocol and tool tests pass locally |
| 3 | Secure remote connection | Authentication, origin checks, permissions and negative tests pass |
| 4 | Optional controlled writes | Explicit allowlists, approval, isolated execution broker, audit coverage |
| 5 | Portable release | CI, non-root Docker image, Compose, install/stop/uninstall and VPS verification |

## Release constraints
Don't call the scaffold production-ready. Avoid claiming universal ChatGPT account support or zero cost. Confirm client-specific tool availability before enabling write operations.
