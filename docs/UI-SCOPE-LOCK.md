# UI Control Panel — Forensic Scope Lock

**Date:** 2026-10-28  
**Baseline branch:** `main` at `d44e16f810628a1425c40e61375b030a60d1a084`  
**Goal:** Preserve every existing user-facing feature while addressing functional, security, responsiveness, accessibility, and visual consistency defects.

## Locked implementation surface
- `public/panel.html`, `public/panel.css`, `public/panel.js`
- `tests/ui.test.ts` (UI-specific source/interaction tests)
- `docs/UI-SCOPE-LOCK.md`, `docs/UI-FORENSIC-AUDIT.md` (documentation)
- No edits to OAuth, login verification backend, HTTP routes, broker, Docker, Compose, VPS, CI or package dependencies.

## Backend contracts (read-only for this scope)
- `GET /api/session` ⇒ `{username,csrf}`; 401 if not logged in.
- `POST /api/login` ⇒ `{ok,csrf}`; session cookie managed by server.
- `POST /api/logout` ⇒ `{ok}`, requires `x-csrf-token`.
- `GET /api/status` ⇒ `{mcpEnabled,endpoint,allowedTools,oauth:{clients,activeTokens},system:{cpuCount,totalMemoryBytes,freeMemoryBytes,uptimeSeconds},publicHttps,audit,writesEnabled,pendingApprovals,enrollmentSeconds}`.
- `POST /api/mcp`, `POST /api/enrollment`, `POST /api/approval` require session and CSRF.
- `/oauth/authorize?...` is navigated to when an already-signed-in user has a safe same-origin return target.

## Existing UI features preserved
Login/logout, service metrics, allowed tools, temporary client enrollment, MCP enable/disable, pending write approvals, recent audit and responsive dark theme.

## Explicit additions within UI only
Central 401 handling, safe failed-logout state, pending-action locks and confirmation, semantic/accessible labels and live feedback, audit filter, endpoint copy, better responsive behavior, color/contrast/focus states.

## Explicit exclusions
- OAuth-client list/revocation: backend does not expose client records or management endpoints.
- Real-time broker health: backend does not return broker health.
- Per-tool permission editor: no admin settings API exists.
- Restart/install/deploy UI: these require backend/infrastructure and are not invented.
- Production safety attestation: UI code review/testing does not substitute for real HTTPS/auth/broker/VPS deployment verification.

## Release gates
UI ID consistency; interaction tests for authentication states, CSRF, approvals, logout and audit; existing full `npm run check`; browser preview check when available; no backend changes.
