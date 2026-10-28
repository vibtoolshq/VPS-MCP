# VPS-MCP — Final Security & Deployment Forensic Audit

**Audit date:** 2026-10-28  
**Repository:** `vibtoolshq/VPS-MCP`  
**Baseline:** `ad8c70b05b1c59a0441ab53f358ddf0d2416e710`  
**Scope:** Complete source, advanced control panel, OAuth, MCP, private Docker/Compose, bootstrap, installer lifecycle, data persistence, backup and restore.

## Scope and method

Reviewed all runtime security-sensitive modules and deployment artifacts, inspected the existing tests and CI Docker smoke run, and added targeted regression checks for newly discovered issues. No live Contabo VPS was modified. The final CI must be checked at [GitHub Actions](https://github.com/vibtoolshq/VPS-MCP/actions) before relying on the changes.

## Fixed issues

| Finding | Severity | Root cause | Remediation |
| --- | --- | --- | --- |
| SETUP-01 | High | If `admin.json` vanished after account initialization, the installer-generated token hash could leave first-run setup available again | Durable separate `admin.json.complete` marker blocks reinitialization and requires backup recovery; regression test |
| INSTALL-02 | High | Missing `.env` over an existing persistent Docker volume could silently generate a new setup hash | Installer refuses to recreate secrets when the project volume already exists |
| NETWORK-03 | High | `MCP_PRIVATE_CONTAINER` could be used with a non-loopback configured origin, misrepresenting a public plaintext listener as private | Enforce private 0.0.0.0 internal bind with exact loopback origin; reject other combinations in tests |
| SUPPLY-04 | Medium | No committed package lock; image/CI resolved transitive dependency versions nondeterministically | Generate and commit `package-lock.json`; switch Docker and CI to `npm ci`; remove the temporary write-permission workflow |
| UPDATE-05 | Medium | Legacy development `.env` might be interpreted as a compatible production configuration, resulting in a broken or insecure upgrade | Installer/update scripts explicitly refuse incompatible legacy config rather than rewriting secrets |
| BACKUP-06 | High | No automated consistent backup/check of persisted credentials, policies, OAuth and audit data | Add private backup + verification scripts; API stopped during snapshot; 0600 outputs; existing data preserved |
| RESTORE-07 | High | No verified restoration path to recover an installation | Add restore command that refuses existing `.env`/volume and validates private archive entries; integration test uses a separate Docker project and volume |
| TEST-08 | Medium | Prior CI validated first-setup status but not real account creation, restart persistence or disaster-recovery flow | Extend Docker smoke test to complete first setup, restart, login, backup and isolated restore |

## Current protection layers

- Non-root app UID 10001, read-only filesystem, dropped Linux capabilities, no-new-privileges and resource limits.
- Host published interface is 127.0.0.1:3000 only, accessed via SSH port forwarding; no public TLS endpoint is exposed by this profile.
- One-time installer token, mandatory strong-password first visit; `admin / Pass@123` only an onboarding example and **cannot authenticate**.
- Private named Docker volume for admin/OAuth/policy/audit data; no host Docker socket in the web process.
- `MCP_ENABLE_WRITES=false`, read-only tools only, independent client restrictions and manually controlled OAuth enrollment.
- Refuse-on-existing-data restore, safe installer/update behavior and consistent backup.

## Release gate and unresolved risks

**Private, SSH-only deployment candidate:** Source/CI checks and Docker smoke tests can validate this profile. Deploy on an authorized clean VPS, check host port binding, SSH tunnel, restart, backup/restore and local user credentials before declaring actual production service.

**Public ChatGPT-connected production: NOT READY.** This still requires domain/DNS, trusted HTTPS gateway, correct OAuth callback redirects, live MCP client validation and external threat review.

**Privileged VPS management: NOT READY.** The broker is not deployed in the default container because shared-secret authorization and Docker socket control can become root-equivalent. A truly independent broker authorization boundary is a prerequisite.

**Further hardening:** Pin base-image and GitHub Action immutable digests; audit the container with an external security scanner; encrypt off-server backups; document rotation/retention and incident recovery; test UI accessibility in a real browser; run live network/host firewall verification; complete repeatable deployment on the user's VPS.

## Integrity and limitations

No test suite proves the absence of all bugs. `npm audit` checks reported advisories, not unknown vulnerabilities. Docker CI runs on a disposable GitHub runner, not on the user's Contabo instance. No changes were made to existing Coolify or other VPS services.

**Decision:** Release the private/non-privileged profile only after on-host verification. Do not expose the default container publicly or advertise unrestricted remote host management until the remaining high-impact gates pass.
