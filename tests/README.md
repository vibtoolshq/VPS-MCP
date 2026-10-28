# Test coverage

Run `npm run check`: TypeScript typecheck, all `node:test` suites and compiled build.

- Phase 02: system metrics, local MCP protocol and validated disk paths.
- Phase 03: admin login, CSRF, OAuth PKCE token exchange, rotating refresh tokens, Host/Origin rejection and persisted registration state.
- Phase 04: safe workspace paths, symlink/hidden/overwrite rejection, broker Unix socket authentication and allowlist, approval lifecycle, OAuth `vps:write` request, admin CSRF approval, single-use execution and denied read-only client writes.

CI uses a temporary workspace and a broker running without Docker privileges. It does not restart real production containers, synchronize real deployment repositories or establish a live ChatGPT connection.

## Post-Phase-04 forensic checks

`tests/forensic.test.ts` covers OAuth enrollment capacity, stale callback revocation, private state file permissions, persistent MCP disable and fail-closed write audit. `tests/ui.test.ts` checks the static control-panel assets and required element IDs. GitHub Actions includes high-severity npm advisory checks for both runtime and development dependencies.
