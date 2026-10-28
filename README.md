# VPS-MCP

**Security-first, portable VPS Monitoring & MCP Control Panel** — Node.js 22 + TypeScript + MCP Streamable HTTP + OAuth + lightweight HTML/CSS/JavaScript dashboard, deployed with Docker Compose.

> **Release status (28 October 2026):** The **private, SSH-only deployment** has passed source tests and Docker CI, including first-admin setup, restart, backup and restore. **Public ChatGPT/AI remote connection, public HTTPS/OAuth and privileged Docker/Git operations are not yet live-validated or production-ready.** Do not treat the default installation as an Internet-facing MCP server.

**Guide language:** Clear English with copy-paste terminal commands and step-by-step explanations. Commands target Ubuntu 24.04 LTS unless otherwise noted.

## Table of contents

1. [At a glance: what works today](#1-at-a-glance-what-works-today)
2. [Architecture and security boundaries](#2-architecture-and-security-boundaries)
3. [Prerequisites and VPS preparation](#3-prerequisites-and-vps-preparation)
4. [Docker Engine and Compose installation](#4-docker-engine-and-compose-installation)
5. [Download and install VPS-MCP](#5-download-and-install-vps-mcp)
6. [Open the panel securely from Windows or Linux](#6-open-the-panel-securely-from-windows-or-linux)
7. [Mandatory first-login administrator setup](#7-mandatory-first-login-administrator-setup)
8. [Control Panel and permission management](#8-control-panel-and-permission-management)
9. [Health checks and verification](#9-health-checks-and-verification)
10. [Daily operations, updates and service logs](#10-daily-operations-updates-and-service-logs)
11. [Backup, restore and migration](#11-backup-restore-and-migration)
12. [Connecting ChatGPT or another AI client](#12-connecting-chatgpt-or-another-ai-client)
13. [OAuth and HTTPS integration requirements](#13-oauth-and-https-integration-requirements)
14. [Example AI prompts and use cases](#14-example-ai-prompts-and-use-cases)
15. [Troubleshooting](#15-troubleshooting)
16. [Security checklist and known limits](#16-security-checklist-and-known-limits)
17. [Developer commands, tools and project structure](#17-developer-commands-tools-and-project-structure)
18. [Official documentation and release status](#18-official-documentation-and-release-status)

---

## 1. At a glance: what works today

| Feature | Current state |
| --- | --- |
| Ubuntu VPS installation with Compose | ✅ Private profile, tested in GitHub CI |
| Automatic `.env` generation | ✅ No manual environment editing for **private** installation |
| Setup token and forced first-visit admin setup | ✅ Implemented; login blocked until setup |
| Starter username `admin` | ✅ Suggested on first visit |
| Starter password `Pass@123` | ⚠️ Displayed as an example; **never accepted as the final password** |
| Clean responsive web dashboard | ✅ Login, metrics, tools, approvals, clients, audit |
| Per-tool / per-client access controls | ✅ Backend-enforced within configured ceilings |
| Read-only system MCP tools | ✅ `system_status` and `disk_usage` in default Compose profile |
| Restart, stop, update, private backup and isolated restore | ✅ Scripts plus CI smoke tests |
| Open Control Panel from your PC | ✅ SSH port forwarding |
| Use ChatGPT from the cloud | 🚧 Requires supported tunnel or public HTTPS + OAuth integration, **not plug-and-play yet** |
| Docker restart, Git deployment and VPS file writes from AI | 🚧 Code exists for restricted broker workflows; **not enabled/deployed** in the private image |
| Arbitrary shell, root SSH, firewall changes | ❌ Not implemented; intentionally not exposed |

**Important:** A tool displayed in the dashboard as locked cannot be unlocked merely by clicking ON. The server's validated configuration is the upper permission ceiling.

### Quick command overview

| Goal | From the VPS repository directory |
| --- | --- |
| First installation | `sudo bash scripts/install.sh` |
| Check containers | `sudo bash scripts/status.sh` |
| Follow logs | `sudo docker compose logs -f --tail=100 api` |
| Stop | `sudo bash scripts/stop.sh` |
| Start again | `sudo docker compose up -d` |
| Update to checked-out source | `sudo bash scripts/update.sh` |
| Consistent private backup | `sudo bash scripts/backup.sh` |
| Validate backup | `sudo bash scripts/check-backup.sh /PATH/TO/BACKUP` |
| Restore to a **new empty** installation | `sudo bash scripts/restore.sh /PATH/TO/BACKUP` |
| Remove running services but keep data | `sudo bash scripts/uninstall.sh` |

> We use `sudo` because access to the Docker daemon / `docker` group is effectively root-level. If the current account already has permitted Docker access, the leading `sudo` can be omitted. Never publish passwords or setup tokens in shell history, screenshots, issues or chat messages.

## 2. Architecture and security boundaries

```text
Your Windows / Linux computer
    └─ SSH tunnel (encrypted)
         └─ VPS host: 127.0.0.1:3000 only
             └─ Docker Compose: vps-mcp
                 ├─ init-data (one-time volume ownership helper)
                 └─ api (Node.js MCP + OAuth + Admin UI)
                      ├─ non-root UID 10001
                      ├─ read-only container filesystem
                      ├─ no Docker socket / host-root access
                      ├─ default read-only MCP permissions
                      └─ private named volume: vps-mcp_mcp-data
                          ├─ admin.json / admin.json.complete
                          ├─ oauth-state.json
                          ├─ policy.json
                          ├─ control.json
                          └─ audit.jsonl
```

Default Compose binds `127.0.0.1:3000:3000` — the **host's loopback address**, not the public VPS IP. No need to open ports 3000/8000/8080 on the external firewall. Docker itself needs ordinary administrative privileges to install and manage; this project does not need to be a member of the Docker group.

The application is not a complete host-administration agent. It cannot automatically inspect or restart other host Docker containers when its own container does **not** have Docker daemon access. This is intentional to prevent a compromised AI connection from gaining host-root privileges.

**Network security:** SSH tunnel is suitable for your local administrator dashboard. ChatGPT cloud services cannot enter your SSH-local tunnel merely by knowing `http://127.0.0.1:3000`.

## 3. Prerequisites and VPS preparation

Recommended starting point:

- A VPS you administer, for example Ubuntu Server 24.04 LTS.
- At least ~2 vCPU, 2 GiB RAM, adequate storage for images and audit data (guidance, not a hard limit).
- SSH/sudo access and outbound package downloads.
- Docker Engine, Docker Compose plugin, Git and OpenSSL.
- A free local TCP port **3000** on the VPS and the laptop used for the SSH tunnel.
- A recent browser; Windows PowerShell/OpenSSH, PuTTY, macOS or Linux work for tunnel access.

### Step 3.1 — SSH into the VPS

From Windows PowerShell or a Linux terminal:

```bash
ssh ubuntu@YOUR_VPS_IP
```

Replace `ubuntu` and `YOUR_VPS_IP` with your actual SSH account and host address. You can also log in with PuTTY. The instructions below run **inside the VPS SSH session**, not on your laptop.

### Step 3.2 — Basic checks

```bash
cat /etc/os-release
uname -m
free -h
df -h /
sudo -v
```

Install prerequisites:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl
```

**If you already have Docker Engine and the Compose plugin installed**, check them and skip section 4:

```bash
sudo docker version
sudo docker compose version
```

Do not reinstall Docker or change the firewall on a VPS that already hosts production services unless you have reviewed the impact.

## 4. Docker Engine and Compose installation

This section follows the official Docker Engine Ubuntu `apt` repository method. Use it on a **new / reviewed** Ubuntu VPS without a conflicting Docker installation. See [Docker's current Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/) before running it.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Optional check:

```bash
sudo systemctl is-active docker
```

Expected output: `active`. Avoid `curl ... | sh` commands from unreviewed websites. Installation of Docker can affect firewall packet forwarding; check your host's existing exposure and other container workloads.

## 5. Download and install VPS-MCP

### Step 5.1 — Clone the repository

Run on the VPS:

```bash
cd ~
git clone https://github.com/vibtoolshq/VPS-MCP.git
cd VPS-MCP
git status
```

On an already cloned project, simply enter its existing directory. **Do not replace an existing installation's `.env` or persistent volume.**

### Step 5.2 — Check that port 3000 is not already occupied

```bash
sudo ss -lntp | grep ':3000 ' || true
```

No matching output generally means there is no listener on port 3000. If another service already uses it, do not stop that service blindly; choose a different port only after reviewing the Compose and origin configuration together.

### Step 5.3 — Run the one-command installer

```bash
sudo bash scripts/install.sh
```

The installer automatically:

1. Checks Docker and Compose availability.
2. Refuses to reset an existing installation if `.env` is missing but its data volume exists.
3. Generates a fresh random **one-time setup token**.
4. Creates a mode-`0600` private `.env` (no manual editing).
5. Builds and starts the restricted Docker Compose stack.
6. Prints the setup token **once** in the SSH terminal.

Example terminal output **illustration only**:

```text
=== VPS-MCP — ONE-TIME FIRST-LOGIN SETUP ===
Initial username suggestion: admin
Starter password example: Pass@123 (must change; never active)
Setup token: [a unique 64-character secret printed here]
```

Save the setup token privately until your first visit is complete. **Do not paste it into the README, GitHub, ChatGPT, a support ticket, or a public screenshot.** It is not the administrator's long-term password.

### Step 5.4 — Verify installation

```bash
sudo docker compose ps
curl --fail --silent http://127.0.0.1:3000/health
curl --fail --silent http://127.0.0.1:3000/api/setup/status
```

Before setup, expected status contains `"required":true`. The health response contains `"status":"ok"`. The host port is only on `127.0.0.1`.

If startup fails, see [Troubleshooting](#15-troubleshooting). Read the container logs, rather than rerunning commands that erase Docker volumes.

## 6. Open the panel securely from Windows or Linux

**Do not visit `http://YOUR_VPS_IP:3000`** — it is intentionally not publicly published.

### Option A — Windows PowerShell / Terminal / macOS / Linux

Open a **new terminal on your own computer**, not on the VPS:

```bash
ssh -N -L 3000:127.0.0.1:3000 ubuntu@YOUR_VPS_IP
```

Leave this tunnel terminal open. Then open on the **same computer**:

**[http://127.0.0.1:3000](http://127.0.0.1:3000)**

`-N` means SSH does not start a remote command; `-L` maps your laptop's local 3000 port to the VPS's local 3000 port. The password/SSH key remains under your own SSH client. **Use local port 3000 for the supported default.** If it is already occupied on your computer, stop or reconfigure the conflicting local application first. Although SSH can forward a different local port, this server checks HTTP Host/Origin against its configured origin; simply forwarding local 3300 to remote 3000 **will not reliably work without reviewed server-origin configuration**. Do not disable Host/Origin security checks to bypass this.

### Option B — PuTTY on Windows

1. Open **PuTTY** and enter the VPS address in `Session → Host Name` (SSH port normally 22).
2. Open `Connection → SSH → Tunnels`.
3. Set **Source port** = `3000`.
4. Set **Destination** = `127.0.0.1:3000`.
5. Select **Local**, then **Add**.
6. Open the SSH session and sign in.
7. Open your PC browser at `http://127.0.0.1:3000`.

If the page does not load, confirm the SSH session remains connected, the container is running and both the VPS and PC port 3000 are free.

## 7. Mandatory first-login administrator setup

The first browser visit does **not** take you directly to a logged-in dashboard.

1. Open the private dashboard via the SSH tunnel.
2. The **Create your admin account** screen appears automatically.
3. Enter the **one-time VPS setup token** printed during installation.
4. Username initially suggests `admin`; you may keep it or choose another valid account name.
5. The UI initially displays `Pass@123` as an example; **replace it** with your own strong password, minimum 12 characters.
6. Repeat the new password in confirmation.
7. Select **Save secure admin account**.
8. You are returned to the login view. Sign in using **your chosen credentials**.

**Security rules:**

- `admin / Pass@123` is **not an active default account/password pair**.
- The server rejects `Pass@123` as the final password.
- Anonymous login, OAuth and MCP access are disabled until first setup is complete.
- The admin password is saved as a **scrypt hash** in the private data volume, not plaintext.
- First setup is one-time. If the credential file disappears after setup, the service **refuses to reopen setup**; use a trusted backup instead.
- Failed setup/login attempts are rate-limited; avoid repeated guessing.

Once logged in, check **MCP enabled**, **global tool permissions**, **security audit history**, **client enrollment** and **system metrics**.

## 8. Control Panel and permission management

The dashboard uses a compact dark interface with no heavyweight frontend framework.

| Section | What you can do |
| --- | --- |
| Overview | View reported MCP enabled state, endpoint, tool/client/token counts |
| System | View CPU, memory, uptime and related status |
| MCP Master Switch | Enable/disable the MCP API; shutdown state persists after restart |
| Tool Permissions | Enable/disable each **configured** MCP tool |
| Write Operations | Pause write gate; separately restrict file creation, Docker restart and Git sync **when backend is configured** |
| Registered Clients | View OAuth client counts/redirects, restrict a client's tools or `vps:read`/`vps:write` access, revoke client |
| OAuth Enrollment | Open/close a **5-minute** new-client registration window, maximum 5 registrations per window |
| Pending Approvals | Confirm/deny sensitive operations, subject to OAuth scopes and current policy |
| Security Audit | View recent events, filter, review denials and action history |
| Sign Out | Invalidate the current web admin session |

### Effective permissions: how ON/OFF really works

An action works only when **all** gates allow it:

```text
Environment hard ceiling
     AND global tool allowed
     AND client tool allowed
     AND client policy allowed
     AND valid OAuth token / requested scopes
     AND (for writes) write gate + approved operation + restricted broker
```

The private installer enables only:

```text
MCP_ALLOWED_TOOLS=system_status,disk_usage
MCP_ENABLE_WRITES=false
MCP_ALLOW_GIT_SYNC=false
```

Therefore you **cannot turn on Docker restart, Git sync, unrestricted terminal, or workspace writes from the web UI** in this private profile. This is a safety property, not a broken toggle. Refer to [Advanced Control Panel Guide](docs/ADVANCED-CONTROL-PANEL.md) for the backend permission contract and API routes.

### Available tool catalog

| Tool | Function | Default private installer |
| --- | --- | --- |
| `system_status` | System CPU/RAM/uptime/read-only load status | ✅ Enabled |
| `disk_usage` | Disk statistics for `/` and `/tmp` | ✅ Enabled |
| `workspace_list` | List approved workspace entries | Locked, requires read root |
| `workspace_read` | Read bounded approved text files | Locked, requires read root |
| `docker_status` | Inspect allowlisted Docker container through broker | Locked, requires broker |
| `deployment_status` | Inspect configured Git deployment repository | Locked, requires broker |
| `operation_request` | Request a restricted write for admin approval | Locked by default |
| `operation_execute` | Execute only an already-approved single-use operation | Locked by default |

Code for the separately restricted broker exists under `src/broker/`, but the default Compose **does not launch it**. Do not attach `/var/run/docker.sock` to the API container to make locked features appear functional.

### New: Compact sidebar Control Console

The logged-in dashboard is now split into **seven lightweight, focused pages**, rather than one long page: **Overview, Tool access, Operations, Clients, Approvals, Domain & SSL, Security audit**. All seven stay inside the same authenticated panel, with a compact sticky sidebar on desktop and a horizontal, scrollable menu on narrow screens. No frontend framework or page reload is needed.

### Domain, SSL & Port controls — important safety boundary

Go to **Domain & SSL** from the sidebar to inspect the **active** origin, internal application port, Docker host bind/port and TLS state. You can save a validated **draft** containing a domain, a private host port (1024–65535) and a private-vs-external-HTTPS plan, and run a read-only DNS resolution check.

**Saving the draft DOES NOT change live DNS, issue TLS certificates, change Docker bindings, or expose the server publicly.** The panel labels planned and applied settings separately.

For a change to the **private Docker host port only**, after saving the draft, open a trusted SSH shell on the VPS and run:

\`\`\`bash
cd ~/VPS-MCP
sudo bash scripts/apply-network.sh
\`\`\`

The host-side helper reads only the validated stored port, updates \`MCP_BIND_PORT\` in the private \`.env\`, rebuilds the localhost-only Compose port mapping without rebuilding the image, checks \`/health\` and restores the previous port if the test fails. The internal MCP server origin remains \`http://127.0.0.1:3000\`; the **PC SSH source port stays 3000**. If the new VPS host port is 3300, use:

\`\`\`bash
ssh -N -L 3000:127.0.0.1:3300 ubuntu@YOUR_VPS_IP
\`\`\`

Open \`http://127.0.0.1:3000\` on your computer. Do **not** open port 3300 publicly. Future SSH tunnels must target the new VPS host port. Backups include the saved network draft, and restore allows that configuration file.

**Domain and SSL are NOT one-click-live features in this release:** Real domain ownership, DNS changes, trusted certificate issuance/renewal, HTTPS reverse proxy, public OAuth origin and callback flows still require a separately authorized and externally validated gateway deployment. Selecting "Plan external HTTPS gateway" records intent only; it cannot turn on HTTPS.

Read the [Control Panel & Network Guide](docs/CONTROL-PANEL-NETWORK.md) for exact workflow, validation and limitations.

## 9. Health checks and verification

From inside the VPS project directory:

```bash
sudo docker compose ps
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/api/setup/status
sudo docker compose logs --tail=100 api
```

Optional container hardening checks:

```bash
sudo docker compose exec -T api id -u
sudo docker compose exec -T api node -e "console.log(require('fs').existsSync('/var/run/docker.sock'))"
sudo docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$(sudo docker compose ps -q api)"
```

Expected: UID `10001`, Docker socket `false`, read-only rootfs `true`.

Check no unexpected publicly bound service:

```bash
sudo ss -lntp | grep ':3000 '
```

Expected host binding is **127.0.0.1:3000**. Verify both SSH-tunneled admin login and sign-out from your own browser. A successful `/health` response alone does **not** verify OAuth, persistence or ChatGPT integration.

## 10. Daily operations, updates and service logs

All commands in this section run from `~/VPS-MCP` (or your actual repository directory).

### Status, logs, start, stop

```bash
sudo bash scripts/status.sh
sudo docker compose logs -f --tail=100 api
sudo bash scripts/stop.sh
sudo docker compose up -d
```

Stop terminates containers, **not** the data volume or private `.env`. `Ctrl+C` exits the log viewer; it does not stop the server.

### Update safely

1. Create and verify a backup first (section 11).
2. Check for local uncommitted changes.
3. Pull reviewed repository updates.
4. Run the provided update command.
5. Verify health, login, permissions and logs.

```bash
cd ~/VPS-MCP
git status
git pull --ff-only
sudo bash scripts/update.sh
sudo docker compose ps
curl -fsS http://127.0.0.1:3000/health
```

The update script **does not remove the persistent volume**. For an existing legacy development `.env`, the installer/update command may refuse automatic migration; restore from backup and review configuration rather than overwriting it.

### Uninstall / remove running services

```bash
sudo bash scripts/uninstall.sh
```

This removes the Compose services but **preserves** the private Docker volume and `.env`. It is not a data-erasure command. Do **not** run `docker compose down -v` unless you have explicitly decided to delete your persisted credentials and verified your backups.

## 11. Backup, restore and migration

The persistent private volume stores identity, registration, permission and audit state. **A GitHub push is not a backup of your VPS runtime secrets or Docker data.**

### Step 11.1 — Back up the running installation

```bash
cd ~/VPS-MCP
sudo bash scripts/backup.sh
```

The script stops the API briefly for consistency, copies private `.env` and creates a compressed archive of the data volume, verifies it and restarts the API. It prints a backup directory similar to:

```text
.../backups/vps-mcp-YYYYMMDDTHHMMSSZ-NNNN/
    config.env
    data.tar.gz
```

**These backup files are not encrypted.** They contain sensitive credential hashes and OAuth state. Keep them private, transfer using an encrypted method, and encrypt any off-host backup. The backup directory and contents are not committed to Git.

### Step 11.2 — Verify an archive

```bash
sudo bash scripts/check-backup.sh /ABSOLUTE/PATH/TO/vps-mcp-YYYYMMDDTHHMMSSZ-NNNN
```

Expected message: backup archive and private permissions verified. A structural check does not replace a trial restore.

### Step 11.3 — Restore to a new / empty deployment

On a **separate new installation**, clone the project but **do not run `install.sh` first**. Transfer your verified backup securely to that host, then from the cloned repository directory run:

```bash
sudo bash scripts/restore.sh /ABSOLUTE/PATH/TO/PRIVATE-BACKUP
```

Restore deliberately **refuses** if the destination already has `.env` or the target Docker volume. Do not delete an existing volume just to make restore pass: first decide how to preserve the existing data, then use a separate reviewed recovery workflow. Restored account credentials remain the same; first-login setup will **not** reopen.

After restore, verify health, SSH-tunneled login, permissions, audit records and OAuth client state. The CI validates an isolated restore using a distinct Compose project.

### Step 11.4 — Lost credentials, token or `.env`

| Problem | Safe recovery |
| --- | --- |
| Lost one-time setup token **before** first login | Use a locally authorized recovery procedure or rebuild a genuinely new installation after verified no existing data; there is no anonymous reset endpoint |
| Forgot admin password | Restore the verified account-state backup; no public password-reset API |
| Deleted `.env` but private Docker volume remains | Restore `config.env` from a trusted backup as `.env` with mode 0600; installer intentionally refuses to issue replacement secrets |
| Lost `admin.json` but `admin.json.complete` exists | Restore credentials from backup; the server fails closed |
| OAuth client no longer works after restart | In-memory access tokens reset; reconnect/reauthorize as required and check current enrollment/redirect policy |

## 12. Connecting ChatGPT or another AI client

**Start here: do not confuse your local admin panel with a remote AI connection.**

- **Dashboard:** `http://127.0.0.1:3000` through your computer's SSH tunnel.
- **Local MCP endpoint:** `http://127.0.0.1:3000/mcp`, requiring an OAuth bearer token.
- **ChatGPT cloud:** cannot directly access VPS loopback or your personal SSH tunnel.
- **Remote MCP connection:** needs a supported **Secure MCP Tunnel** or public HTTPS MCP endpoint, plus authentication that works **end-to-end**.

The current repository's private Compose profile has a **loopback OAuth issuer**, no public callback allowlist configured by the installer, and no bundled or tested OpenAI tunnel client. Therefore **entering the local `/mcp` URL in ChatGPT will not create a working connection**. Treat the following as integration guidance and requirements, **not a claim that deployment is finished**.

### 12.1 Check account/workspace eligibility

As documented by OpenAI in October 2026, custom MCP connections are managed from **ChatGPT on the web**, under **Plugins → + → Add custom MCP server** (where available). Permissions depend on your plan and workspace:

- ChatGPT Business and Enterprise/Edu workspaces have custom MCP creation/publishing controls subject to admin and organization permissions.
- Pro users can access applicable developer/custom MCP functionality, with **read/fetch restrictions** documented for full MCP. Availability differs from organizational full-write support.
- A feature not visible in your account cannot be enabled by changing the VPS. Check the current [OpenAI Custom MCP Help Center](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

### 12.2 Option A — Secure MCP Tunnel (preferred for a private server)

OpenAI offers **Secure MCP Tunnel**, which can carry MCP traffic over an outbound connection without opening public inbound VPS ports. It involves a separately managed `tunnel-client` and OpenAI Platform/workspace permissions.

High-level operator procedure:

1. Open the [OpenAI Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
2. Confirm your account/workspace has the necessary Platform tunnel management/use permissions and access to custom MCP connections.
3. Create a tunnel in **Platform tunnel settings**, associate the intended ChatGPT workspace, and obtain the actual `tunnel_id` and client credentials.
4. Install OpenAI's official `tunnel-client` **on a trusted host that can reach** `127.0.0.1:3000/mcp` on the VPS. Do **not** mount Docker socket or reuse the web application's identity.
5. Use the official client's instructions to configure its HTTP server target, run diagnostics and keep the tunnel service healthy.
6. In ChatGPT **Plugins → + → Add custom MCP server**, choose **Tunnel**, select the available tunnel or enter its `tunnel_id`, configure authentication and review the security warning.
7. Check OAuth discovery, login redirect and tools before accepting the plugin connection.

**Blocking compatibility warning for this project:** An MCP tunnel can forward MCP requests, but **does not automatically publish this server's browser-facing OAuth authorization page or change its local issuer URL**. The current private `MCP_PUBLIC_URL=http://127.0.0.1:3000` may cause remote OAuth redirects to go to ChatGPT/user-local loopback. A reviewed public/callback-reachable OAuth design is still needed; the bundled installer does not implement it.

Do not paste API keys or tunnel tokens into ChatGPT messages or commit them to GitHub. See the official guide for version-specific `tunnel-client` arguments and access policy.

### 12.3 Option B — Public HTTPS MCP endpoint (separate production architecture)

For a public plugin or other internet-based AI client, the application needs an **actual, validated HTTPS deployment**, for example:

```text
AI client / ChatGPT
    ↓ HTTPS + validated OAuth
https://mcp.your-domain.example/mcp
    ↓ trusted proxy / restricted ingress
Private MCP API and separately protected admin access
```

Before attempting this design:

1. Own and configure a domain/subdomain with DNS pointing to the reviewed gateway.
2. Terminate public HTTPS with a valid certificate, lifecycle/renewal and trusted reverse proxy, or properly configure a native TLS listener.
3. Keep the admin interface accessible only to authorized operators; avoid opening a public password-setup route.
4. Configure a **canonical external HTTPS origin** for MCP/OAuth. The current private-mode configuration **cannot simply be switched to a public origin while keeping `MCP_PRIVATE_CONTAINER=true`**; it explicitly rejects that combination.
5. Ensure proxy Host/Origin behavior, trusted forwarding, OAuth metadata, issuer and resource URLs are consistent. Current private Compose and HTTP host checks are not certified for an arbitrary reverse proxy.
6. Implement/configure the exact allowed ChatGPT OAuth callback(s), redirect consistency, PKCE-S256 and token refresh; verify in a real client.
7. Add limits, monitoring, firewall rules, credential rotation, off-host backups and incident recovery.
8. Test the complete OAuth and MCP flow before treating the endpoint as ready. **Do not map `0.0.0.0:3000:3000` or disable Host/Origin checks as a shortcut.**

**Current project state:** This public topology is a **release requirement, not a provided one-command profile**. Production HTTPS/OAuth configuration and live ChatGPT verification still require engineering and operational work.

### 12.4 ChatGPT connection steps — after transport + OAuth are validated

When you have a real usable HTTPS or tunnel-backed endpoint:

1. In a supported ChatGPT web account, open **Plugins**.
2. Select the **+** button → **Add custom MCP server**.
3. Set a clear name such as `VPS-MCP (Read-only)` and describe the server's limited permissions.
4. Under **Connection**, provide the verified `https://mcp.your-domain.example/mcp` URL **or** select your configured **Tunnel**.
5. Configure the OAuth flow. Use the **exact callback URI displayed in the connection workflow**, **not** an assumed or copied callback string.
6. On the VPS panel (once correct HTTPS/OAuth configuration exists), temporarily open **OAuth Enrollment** for five minutes **before** the DCR client-registration step.
7. Complete the OAuth login and consent with your admin account. Request only the supported read-only capabilities initially.
8. Review the risk warning; select the acknowledgement checkbox and **Create as a plugin**.
9. Review discovered tools. Install/enable the plugin in the appropriate workspace or account.
10. In a new ChatGPT conversation, select the plugin with `@` or the Plugins picker, and try the read-only examples below.

Tool lists may need explicit refresh after permission or schema changes. For workspace publication, follow your organization's admin policies and app review steps. See [OpenAI's connect-and-test guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### 12.5 Other AI applications, Codex and the OpenAI API

A client can integrate if it actually supports **remote MCP Streamable HTTP** and the server's OAuth 2.1 flow. The intended server has a `POST /mcp` endpoint and metadata/authorization endpoints, but each AI product has different supported connection and authentication mechanisms.

For OpenAI API remote MCP usage, consult [OpenAI's MCP tool guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp): public targets use `server_url`, whereas Secure MCP Tunnel targets use `tunnel_id` in supported API flows. The API requires separately acquired, valid authorization credentials for protected tools. This README does not generate or expose tokens or claim automatic authentication for arbitrary clients.

**Never** use the public AI integration as a workaround for direct root/SSH access. Keep sensitive operations behind explicit permission checks and a reviewed broker.

## 13. OAuth and HTTPS integration requirements

These are the exact **existing** server routes and relevant constraints, useful for engineering and troubleshooting.

| URL / route | Purpose |
| --- | --- |
| `/` | Admin login, mandatory first-visit setup and dashboard |
| `/health` | Minimal health response (not an auth test) |
| `/api/setup/status` | Is first-visit admin setup required? |
| `/api/setup` | One-time setup token + new admin account |
| `/api/session` and `/api/status` | Admin-session-only status and security controls |
| `/api/mcp` | Admin CSRF-protected MCP master switch |
| `/api/enrollment` | Admin CSRF-protected five-minute OAuth registration window |
| `/api/control/*` | Granular admin policy controls |
| `/api/approval` | Manual approval/deny for a pending write |
| `/mcp` | OAuth Bearer-protected MCP Streamable HTTP POST |
| `/.well-known/oauth-protected-resource` | OAuth protected resource discovery |
| `/.well-known/oauth-authorization-server` | OAuth authorization server metadata |
| `/oauth/register` | Restricted OAuth dynamic client registration |
| `/oauth/authorize` | Admin consent and authorization |
| `/oauth/token` | Authorization-code/refresh-token exchange |
| `/oauth/revoke` | Token revocation |

### OAuth design present in code

- Authorization code + **PKCE S256**; server-issued access and rotating refresh tokens.
- Dynamic Client Registration (**DCR**), but **closed by default**. No built-in CIMD client metadata registration implementation.
- Exact callback allowlist is read from `OAUTH_ALLOWED_REDIRECT_URIS`. The default generated private `.env` leaves this empty, so **new remote OAuth clients cannot register**.
- The server uses its configured origin to publish the issuer and resource information.
- `vps:read` is required for MCP requests; `vps:write` is available only if write capability is configured and separately authorized.
- The metadata advertises `offline_access`; actual long-lived connectivity still needs live token-refresh verification with ChatGPT.
- Existing access tokens are **in memory** and reset on Node restart; OAuth client registration and refresh-token hashes are on persistent disk.

**Callback rule:** OpenAI's exact callback URL can vary by connection mode and issuer-validation behavior (including a stable redirect or a callback-ID-specific redirect). **Copy it from your ChatGPT connection UI.** Do not assume a static URL just because it appears in a tutorial. Refer to [OpenAI OAuth Authentication](https://developers.openai.com/plugins/build/auth).

### External verification checklist (before any public use)

- The public HTTPS certificate validates; no broken redirect to localhost.
- Public `/.well-known/*` metadata URLs report the exact external issuer and resource.
- PKCE `S256` is advertised and supported.
- ChatGPT's exact callback is allowlisted.
- New client registration only opens during a short approved enrollment window.
- Browser OAuth login/consent, code exchange, token refresh and reconnect succeed.
- MCP discovery lists **only** the expected, granted tools.
- Disabled clients and revoked tokens are actually rejected.
- Security controls remain intact after restart; no unapproved Docker/Git privileged broker is exposed.

**Do not enable a public endpoint before these requirements are tested.**

## 14. Example AI prompts and use cases

These examples are **for after a supported AI MCP connection has been successfully established**; they are not executable in ChatGPT simply because you installed the private dashboard.

Read-only prompts for the default tool profile:

- “Use the VPS-MCP plugin to show the VPS CPU count, memory and uptime.”
- “Check disk usage for `/` and `/tmp`. Summarize the results without changing the VPS.”
- “Read VPS system status and suggest whether capacity upgrades are needed. Don't perform any action.”

If explicitly enabled in a future independently secured broker deployment, restricted tools could support inspecting an allowlisted container or proposing a single pre-approved write. **The current private Docker installation does not provide these write abilities.**

A useful testing sequence is: tool discovery → one permitted read → one deliberately forbidden action → revoke test client → verify the old token no longer works.

## 15. Troubleshooting

| Symptom | Likely cause / safe fix |
| --- | --- |
| `docker: command not found` | Install Docker Engine; section 4 |
| `docker compose` unavailable | Install Docker Compose plugin; do not assume legacy `docker-compose` |
| Docker permission denied | Use `sudo` or reviewed daemon permissions; avoid casually adding users to the root-equivalent Docker group |
| Browser won't open `127.0.0.1:3000` | SSH tunnel not running, host port conflict, or Compose container unhealthy |
| Opening `YOUR_VPS_IP:3000` fails | Expected: default installation listens only on host loopback |
| First setup view never appears | Check `/api/setup/status`, container logs and browser console; do not reset data |
| `401` on login | Wrong credentials, old session, or first setup incomplete; check `/api/setup/status` |
| `403` during setup | Incorrect token or weak/rejected password; 429 means rate limit |
| `503 first_setup_required` | Complete mandatory token-based admin setup first |
| Admin state missing after setup | Server refuses a fresh setup. Restore verified data volume backup |
| Installer refuses when `.env` missing | Existing named volume detected; restore `config.env` from backup, don't regenerate |
| Existing legacy `.env` refuses update | Review migration; private Compose profile and earlier dev config aren't interchangeable |
| Tool is visible but locked | Environment did not configure the resource, broker or write capability |
| OAuth `registration_closed` | Open the short enrollment window in the logged-in panel |
| OAuth `invalid_redirect_uri` | Exact callback URL not allowlisted; default private env has none |
| OAuth `invalid_target` or issuer mismatch | Resource/issuer not aligned to reachable canonical HTTPS endpoint |
| ChatGPT cannot connect to `127.0.0.1` | Expected; ChatGPT is remote. Use a supported external transport and validated OAuth |
| Tunnel shows healthy but OAuth fails | OAuth issuer/authorize URL can still be locally scoped or inaccessible to browser; tunnel does not automatically solve it |
| Docker Compose image build fails | Check free disk, Docker daemon, outbound package access, `sudo docker compose logs` and package-lock resolution |
| Changes not reflected in ChatGPT | Refresh/recreate tool connection as supported; previously published app tool snapshots may be frozen |
| Restore refuses existing volume | Designed to protect existing state. Use a new installation/project; never erase state blindly |

Useful diagnostics **without leaking secrets**:

```bash
sudo docker compose ps
sudo docker compose logs --tail=120 api
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/api/setup/status
sudo docker compose config --quiet
```

Avoid posting raw `.env` files, installer tokens, OAuth Bearer headers, cookies, audit records or backup archives into public issue trackers.

## 16. Security checklist and known limits

Before using the private profile:

- [ ] SSH access uses strong keys/passwords and is restricted to authorized administrators.
- [ ] Docker Engine/Compose are current and host firewall exposure is reviewed.
- [ ] Port 3000 is published **only** on 127.0.0.1 (verified).
- [ ] First-visit admin setup completed using the one-time token and a unique 12+ character password.
- [ ] `admin / Pass@123` does not authenticate.
- [ ] API container runs non-root, with read-only filesystem and no `docker.sock`.
- [ ] Only `system_status` and `disk_usage` are enabled by default.
- [ ] `.env` is mode 0600, excluded from Git and backed up securely.
- [ ] Backup was verified and a separate restore can recover the admin login.
- [ ] Access-control toggles, revoked clients and MCP disable state behave as expected.
- [ ] No public proxy, tunnel or AI connector was enabled accidentally.

**Remaining release limitations:**

1. **Live VPS installation:** GitHub Actions Docker smoke tests passed; the user's real Contabo VPS has not yet been configured or tested with this repo.
2. **ChatGPT / remote MCP:** Neither a deployed public HTTPS/OAuth origin nor an integrated Secure MCP Tunnel for this repo has been tested end-to-end. Current local issuer and empty redirect allowlist are blockers.
3. **Privileged broker:** Root-equivalent Docker access and broker approval isolation remain unreviewed for production. Do not solve by mounting the Docker socket in the web API.
4. **Certificate / proxy:** No automatic DNS, certificate renewal, public gateway, or proxy trust integration is shipped in private Compose.
5. **Availability:** OAuth access sessions and pending approvals are process-local and reset on restart; running multiple replicas is unsupported.
6. **Backup storage:** Backup archives are private but **not encrypted** by the script. Encrypt and securely rotate off-server copies.
7. **Supply chain:** `package-lock.json` and `npm ci` pin npm packages, but the Docker base image and workflow action tags may still change unless additionally pinned by immutable digest/SHA.
8. **Security assurance:** Passing tests and `npm audit` do not equal a penetration test, zero vulnerabilities or full disaster-recovery certification.

## 17. Developer commands, tools and project structure

For development on a trusted local machine (not the private Compose installer):

```bash
git clone https://github.com/vibtoolshq/VPS-MCP.git
cd VPS-MCP
npm ci
cp .env.example .env
node scripts/hash-password.mjs
# Follow the hash helper's instructions and configure a private local admin hash.
npm run check
npm run dev
```

The generated `.env.example` is a **development reference**, not a public deployment profile. To run the first-visit installer, use **`bash scripts/install.sh`**, not `npm run dev`. Do not commit real configuration.

Selected Node scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Start TypeScript entrypoint for local development |
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Automated Node/MCP/UI/security tests |
| `npm run build` | Compile to `dist/` |
| `npm run check` | Typecheck + tests + build |
| `npm start` | Start compiled application |
| `npm run broker` | Run separate broker in a developer-controlled environment; **not enabled in default Compose** |

Project map:

```text
VPS-MCP/
├── README.md
├── Dockerfile
├── compose.yaml
├── package.json
├── package-lock.json
├── .env.example, .dockerignore, .gitignore
├── public/
│   ├── panel.html
│   ├── panel.css
│   └── panel.js
├── src/
│   ├── index.ts
│   ├── server/          # HTTP router and MCP transport
│   ├── security/        # setup, auth, OAuth, permissions, audit, approvals
│   ├── tools/           # read-only and restricted tool implementations
│   ├── broker/          # optional restricted broker; NOT in default Compose
│   └── shared/          # validated runtime configuration
├── config/              # example permissions configuration
├── scripts/
│   ├── install.sh
│   ├── status.sh, stop.sh, update.sh, uninstall.sh
│   ├── backup.sh, check-backup.sh, restore.sh
│   └── hash-password.mjs
├── tests/               # source, security, UI and setup regression tests
├── docs/                # security, forensic audits, roadmap and phase guides
└── .github/workflows/   # tests, dependency audit, Docker/restore CI
```

## 18. Official documentation and release status

**OpenAI / MCP:**

- [Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
- [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [OpenAI plugin OAuth authentication](https://developers.openai.com/plugins/build/auth)
- [OpenAI API MCP tools](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)

**Repository-specific supporting documents:**

- [Phase 05 Private Install Guide](docs/PHASE-05-PRIVATE-INSTALL.md)
- [Advanced Control Panel Guide](docs/ADVANCED-CONTROL-PANEL.md)
- [Final Release Forensic Audit](docs/FINAL-RELEASE-AUDIT.md)
- [Security Policy](docs/SECURITY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

### Final recommendation

For **today's verified code**, install the **read-only, localhost-only Docker profile**, finish first-login verification and access the UI through **SSH forwarding**. Use the backup/restore tools and confirm health.

For **AI use from ChatGPT, Codex, an OpenAI API application or a different remote MCP client**, first implement and validate the correct transport + externally reachable OAuth authorization flow. **Do not expose the private service publicly by changing a port mapping.**

### License

No open-source license has been selected or committed. A publicly readable GitHub repository does **not** automatically grant redistribution permission.
