# VPS-MCP UI Control Panel — Forensic Audit & Fix Report

**Date:** 2026-10-28  
**Scope lock:** [UI-SCOPE-LOCK.md](UI-SCOPE-LOCK.md)  
**Baseline:** `d44e16f810628a1425c40e61375b030a60d1a084`  
**Tested UI implementation:** `4937cd009804ca34950b95ba5350c6d757e78acb`  
**UI-only changes:** `public/panel.html`, `public/panel.css`, `public/panel.js`, `tests/ui.test.ts`, `docs/UI-SCOPE-LOCK.md`, this report.

## Executive conclusion

The original panel was lightweight, visually consistent and reasonably compact. However, it lacked durable UX/error-state handling, safe approval-interaction gating, meaningful network feedback and several accessibility affordances. The implementation has been patched **without changing the OAuth backend, HTTP endpoints, broker, package dependencies or deployment configuration**. All original panel features were retained.

## Root-cause findings and resolution

| ID | Impact | Root cause | Fix |
| --- | --- | --- | --- |
| UI-01 | High: session expiry could leave protected dashboard visible | No common `401` response handling | Central request handler clears session and shows verified login view on protected 401 |
| UI-02 | High: double action risk on approval | Approve and Deny buttons acted independently | Shared in-flight lock and disable both buttons during a pending decision |
| UI-03 | High: accidental write approval | No user confirmation of sensitive action | Approval/Deny prompt includes exact server-provided summary and client identifier; no action on cancel |
| UI-04 | Medium: sign-out could appear successful on API failure | Logout error was swallowed and page redirected unconditionally | Sign-out confirmation only after server success; otherwise keep dashboard and explain failure |
| UI-05 | Medium: actions failed without useful feedback | Broad generic errors, silent refresh failures, notice cleared on refresh | Central, bounded user-facing errors plus visible success/error status and busy indicators |
| UI-06 | Medium: misleading connection status | UI labeled configured state as online/secured | Label now says Enabled/Disabled, Configured HTTPS/Loopback; no false live network-health claim |
| UI-07 | Medium: difficulty verifying audit events | Static table without filtering and poor empty handling | Client-side filter of last 20 events, safe text nodes, empty/result state |
| UI-08 | Medium: poor keyboard navigation and mobile ergonomics | No clear focus ring; tight controls/layout | Focus-visible treatment, skip link, responsive row/toolbar/wrapping, button minimum height, reduced-motion support |
| UI-09 | Low: no endpoint copy option | Endpoint was plain text only | Copy button with clipboard fallback |
| UI-10 | Low: enrollment expiry appears frozen | Countdown only refreshed on manual status requests | 1-second in-memory countdown; server remains source of truth on subsequent refresh |
| UI-11 | Medium: inconsistent authentication feedback | Login had no differentiated network/429 feedback | Clear login failure, rate limit, network and expired-session messages |
| UI-12 | Medium: UI vulnerabilities from dynamic data | Rendering lacked explicit safety conventions | All dynamic API/approval/audit content inserted using `textContent`; no `innerHTML` or arbitrary HTML rendering |

## Feature coverage

| Feature | Current UI state |
| --- | --- |
| Admin login and logout | Kept; errors and focus state improved |
| OAuth authorization redirect after login | Kept; same-origin `/oauth/authorize?` target guard |
| MCP enabled/disabled control | Kept; confirmation for disable; persistent state provided by backend |
| Temporary client enrollment | Kept; active/expired countdown and confirmation |
| System CPU, RAM, uptime | Kept |
| Tool allowlist and read/write policy indicator | Kept |
| OAuth client and active-token counters | Kept; **counts**, not a connected-session management feature |
| Pending approval queue | Kept; protected confirmation and in-flight locking |
| Recent security audit | Kept; filtering/empty states added |
| Copy endpoint | Added (browser clipboard permitting) |
| Mobile layout | Retained; spacing/wrapping/focus strengthened |

## Verification

- GitHub Actions: full `npm run check` — TypeScript typecheck, existing OAuth/MCP/broker integration tests and production JS build.
- UI tests using Node VM and mocked DOM/API cover: static element-ID parity, semantic markup, CSP-safe text handling, simulated login/status, audit filter, endpoint copy, approval confirmation/CSRF, session 401 handling and failed logout.
- An independent **offline mock-data HTML preview** was rendered and inspected in headless Chromium at widths 375, 430, 768 and 1440 px: no page-level horizontal overflow; login/dashboard demo mode switches worked. The preview is **representative**, not a mounted, authenticated instance of the real backend or a pixel-perfect automated build of the GitHub assets.
- No files outside the locked scope were modified.

## Design assessment

Style: clean compact dark interface with a restrained navy/indigo palette and low visual overhead. Sections follow a useful hierarchy: status metrics → access control → system → approvals → audit. Improving spacing, focus and feedback made the existing design more usable without adding a large frontend framework.

The status metrics are **configuration/reported-state indicators**, not proof that an external ChatGPT client is currently connected. No auto-refresh polling of privileged actions is enabled.

## Honest release limits (not UI bugs)

1. Per-client OAuth revoke/manage and per-tool permission editing are not available because corresponding authenticated admin APIs do not exist.
2. Broker real-time health, full account management and VPS deploy/build controls are not supplied by the current status API.
3. OAuth consent page is rendered server-side in `src/server/http.ts`, so its detailed flow and component consistency cannot be changed under a **UI-only** code scope; it needs an explicitly authorized server-template review later.
4. UI tests are simulated APIs; do not replace end-to-end testing against an HTTPS deployment with real authentication, real OAuth connections, or a real browser's cookie/CSP policies.
5. Offline preview is demo-only, with no credentials or real VPS connection. Real production integration and privilege hardening are part of Phase 05.
6. The UI does not guarantee screen-reader or WCAG certification: automated accessibility checks plus manual assistive-technology review remain beneficial.

## Disposition

**UI code is audit-patched and verified at source/CI level.** It is reasonable to proceed to Phase 05 production-integration testing. The entire VPS-MCP service must not yet be described as production-secure or live-deployed.
