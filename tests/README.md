# Phase 02 tests

`npm test` checks localhost-only configuration, system and disk statistics, HTTP health/Host/Origin protection, MCP tool discovery, MCP client calls, and rejection of invalid paths.

`npm run check` runs TypeScript typecheck, tests, and build. CI runs the same checks on every push/PR.

Security tests for authenticated remote access and privileged tools belong to later phases.
