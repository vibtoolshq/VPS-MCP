# Architecture

## Scope
Portable TypeScript MCP service deployed as a non-root Docker container. Planned interface: Streamable HTTP behind authenticated TLS or a controlled remote tunnel. Each tool is registered through a central authorization/audit boundary.

## Boundaries
- `src/server`: transport and MCP protocol
- `src/security`: identity, authorization, audit
- `src/tools`: small, capability-oriented tool handlers
- `src/shared`: config/schema utilities
- `config`: example policy (no secrets)

## Important
No transport, tool or policy is implemented at this stage. Docker operations must not receive raw host-level privileges without an additional strictly limited execution broker.
