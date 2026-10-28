# VPS-MCP

**A simple, secure web control panel for your VPS, with MCP support for AI tools.**

VPS-MCP runs inside Docker. It gives you a small dashboard to see system information, manage MCP permissions, review connected clients and prepare domain/network settings.

**New to VPS or Docker?** Start with the steps below. You do not need to edit an `.env` file or know how to code.

> **Important — current release:** The private dashboard and automatic Docker installation are tested in GitHub CI. It works through an **SSH tunnel** (a secure connection from your PC). **Connecting ChatGPT or another cloud AI is not plug-and-play yet**: remote HTTPS/OAuth integration is still required and has not been tested on a live VPS. Domain/SSL options in the panel are planning tools, not automatic certificate installation.

## Start here

You need:
- A VPS running **Ubuntu 24.04** (or another supported Ubuntu version).
- Your VPS **IP address**, SSH username and login method (password or SSH key).
- A Windows, macOS or Linux PC with a browser.
- Docker + Docker Compose on the VPS. If they are missing, see [Install Docker](#3-install-docker-if-needed).

**Where do I type commands?**

| Label | Meaning |
| --- | --- |
| **On the VPS** | In an SSH/PuTTY terminal connected to your Ubuntu server |
| **On your PC** | In PowerShell/Terminal on your own computer |
| **In the browser** | In Chrome/Firefox/Edge on your own computer |

### The 5-step quick start

**Step 1 — On your PC: connect to the VPS**

```bash
ssh ubuntu@YOUR_VPS_IP
```

Replace `YOUR_VPS_IP` with your server IP, and `ubuntu` with your real SSH username. You can use PuTTY instead.

**Step 2 — On the VPS: install Git and OpenSSL**

```bash
sudo apt update
sudo apt install -y git openssl curl ca-certificates
```

If Docker is already installed, continue. Otherwise, follow [Step 3: Install Docker](#3-install-docker-if-needed) first.

**Step 3 — On the VPS: download and install VPS-MCP**

```bash
cd ~
git clone https://github.com/vibtoolshq/VPS-MCP.git
cd VPS-MCP
sudo bash scripts/install.sh
```

The installer builds the app, starts Docker Compose, creates a **private configuration automatically**, and prints a **one-time setup token**.

**Keep the setup token private.** You need it once to create your administrator account. It is shown in the VPS terminal, not sent in a message or email.

**Step 4 — On your PC: open a second terminal for the secure connection**

```bash
ssh -N -L 3000:127.0.0.1:3000 ubuntu@YOUR_VPS_IP
```

Keep this second terminal open. You can use [PuTTY port forwarding](#5-open-the-dashboard-with-putty) instead.

**Step 5 — In your PC browser: open the dashboard**

**http://127.0.0.1:3000**

Enter the setup token, choose a username and **create your own strong password** (12 or more characters). Then log in.

✅ **That's it!** You can now use the private VPS-MCP Control Panel.

> **About the starter login:** The setup screen suggests username `admin` and shows `Pass@123` as an example. **`Pass@123` is not an active password** and must be replaced before the account can be created.

---

## Contents

1. [What can VPS-MCP do?](#1-what-can-vps-mcp-do)
2. [Before you install](#2-before-you-install)
3. [Install Docker (if needed)](#3-install-docker-if-needed)
4. [Install VPS-MCP and set up your account](#4-install-vps-mcp-and-set-up-your-account)
5. [Open the dashboard with PuTTY](#5-open-the-dashboard-with-putty)
6. [Understand the Control Panel](#6-understand-the-control-panel)
7. [Domain, SSL and port settings](#7-domain-ssl-and-port-settings)
8. [Everyday commands: start, stop, update](#8-everyday-commands-start-stop-update)
9. [Backup and restore your data](#9-backup-and-restore-your-data)
10. [Common problems and solutions](#10-common-problems-and-solutions)
11. [Check that everything is working](#11-check-that-everything-is-working)
12. [Connecting ChatGPT or another AI client](#12-connecting-chatgpt-or-another-ai-client)
13. [Important safety rules](#13-important-safety-rules)
14. [More detailed guides](#14-more-detailed-guides)

## 1. What can VPS-MCP do?

| Feature | Available now? |
| --- | --- |
| Install with one script, without editing `.env` | ✅ Yes |
| Create an admin account on first visit | ✅ Yes |
| See system and disk information | ✅ Yes, through the configured read-only tools |
| Use a small, seven-page sidebar dashboard | ✅ Yes |
| Turn configured MCP tools ON/OFF | ✅ Yes |
| Manage OAuth clients and permissions | ✅ Yes, within configured limits |
| Save a domain/SSL plan and check DNS | ✅ Yes, **planning and checking only** |
| Change the private Docker host port safely | ✅ Yes, with a separate VPS command |
| Backup, restore and update | ✅ Scripts provided |
| Automatically install a domain SSL certificate | ❌ Not implemented |
| Connect ChatGPT to this private installation immediately | ❌ Additional remote connection setup required |
| Give an AI unrestricted VPS/Docker/root access | ❌ Disabled for security |

**MCP in simple words:** MCP is a way for an AI application to request information from another service. VPS-MCP controls **which tools an AI client is allowed to use**. By default, only basic read-only information tools are enabled.

## 2. Before you install

Check these things:

- You can log in to your VPS using SSH or PuTTY.
- You have permission to run commands using `sudo`.
- You have enough free disk space for Docker images.
- **Port 3000** is not already used by another app.
- You are not accidentally changing a production VPS that runs other important services.

**On the VPS**, run:

```bash
cat /etc/os-release
free -h
df -h /
sudo ss -lntp | grep ':3000 ' || true
```

If the last command shows another program using port 3000, do not stop it blindly. Read [Domain, SSL and port settings](#7-domain-ssl-and-port-settings) before changing the port.

## 3. Install Docker (if needed)

**Already have Docker?** On the VPS, check:

```bash
sudo docker version
sudo docker compose version
```

If both commands work, **skip this section**.

For a **fresh Ubuntu 24.04 VPS**, install Docker from the official repository. Run these commands **on the VPS**:

```bash
sudo apt update
sudo apt install -y ca-certificates curl

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Check:

```bash
sudo docker version
sudo docker compose version
```

If a command fails, check the [official Docker Ubuntu guide](https://docs.docker.com/engine/install/ubuntu/). **Do not reinstall Docker on a VPS already running other Docker services without reviewing the impact.**

## 4. Install VPS-MCP and set up your account

If you followed Quick Start, you can skip the repeated installation commands below.

**On the VPS:**

```bash
cd ~
git clone https://github.com/vibtoolshq/VPS-MCP.git
cd VPS-MCP
sudo bash scripts/install.sh
```

**What happens automatically?**

1. The installer checks Docker and Compose.
2. It creates a private `.env` configuration file.
3. It generates a random **one-time setup token**.
4. It creates the Docker containers and a private data volume.
5. It prints the setup token in the terminal.

You **do not** need to configure the admin password in `.env` yourself.

**Example installation output** (your token will be different):

```text
=== VPS-MCP — ONE-TIME FIRST-LOGIN SETUP ===
Initial username suggestion: admin
Starter password example: Pass@123 (must change; never active)
Setup token: [YOUR UNIQUE SETUP TOKEN]
```

### Create the admin account

Using the secure PC connection described in Step 4, open:

**http://127.0.0.1:3000**

Fill in the **Create your admin account** form:
1. Paste the one-time setup token.
2. Keep `admin` as your username or enter another username.
3. **Replace the example password** with a new password of at least 12 characters.
4. Confirm it and save.
5. Log in with the username/password you just created.

**Keep your new password safe.** The setup process cannot be repeated from an anonymous web page after the first account has been created.

### If VPS-MCP is already installed

Do not run `git clone` again in the same folder. Use the existing `VPS-MCP` directory and follow [the update steps](#8-everyday-commands-start-stop-update). The installer is designed to preserve an existing private configuration and Docker data.

## 5. Open the dashboard with PuTTY

For Windows users who prefer **PuTTY** over PowerShell:

1. Open **PuTTY**.
2. In **Session**, enter your VPS IP address and SSH port.
3. Go to **Connection → SSH → Tunnels**.
4. Set **Source port** to `3000`.
5. Set **Destination** to `127.0.0.1:3000`.
6. Select **Local**, click **Add**, then **Open**.
7. Log in to the VPS.
8. On your **PC**, open **http://127.0.0.1:3000**.

Leave PuTTY connected while you use the dashboard.

**Why not use `http://YOUR_VPS_IP:3000`?** The app intentionally listens on the VPS's **private localhost interface**, not its public IP. This protects the admin panel.

## 6. Understand the Control Panel

The dashboard has **seven small sidebar pages**, so you don't need to scroll through one long settings page.

| Page | What you will see |
| --- | --- |
| **Overview** | System information, MCP status and main controls |
| **Tool Access** | See which MCP tools are available and switch permitted ones ON/OFF |
| **Operations** | Settings for sensitive actions; writes are disabled by default |
| **Clients** | See connected/registered AI clients and control their access |
| **Approvals** | Review requests that need permission |
| **Domain & SSL** | Domain draft, DNS check and private port settings |
| **Security Audit** | Recent login, access and security events |

**Why is a button locked?** Some features require secure backend configuration, not just an ON switch. The default Docker installation **does not** grant Docker restart, Git deployment or file-write access to AI. This is intentional.

For a full explanation, see [Advanced Control Panel Guide](docs/ADVANCED-CONTROL-PANEL.md).

## 7. Domain, SSL and port settings

Open **Domain & SSL** from the sidebar.

You can:
- See your current private host port and application port.
- Enter a domain name and save it as a **draft**.
- Check whether DNS records resolve.
- Choose a planned SSL/HTTPS mode.
- Save a new **private** Docker host port.

**Very important:** **Save network plan** only saves your choices. It does **not** change DNS records, install SSL certificates or open the app to the public internet.

### Change the private port (optional)

Most beginners should **keep port 3000**.

If you need another port:
1. In **Domain & SSL**, choose a free host port, for example `3300`.
2. Click **Save network plan**.
3. **On the VPS**, run:

```bash
cd ~/VPS-MCP
sudo bash scripts/apply-network.sh
```

4. Reconnect your **PC** SSH tunnel with the same local port `3000` but the new VPS destination port `3300`:

```bash
ssh -N -L 3000:127.0.0.1:3300 ubuntu@YOUR_VPS_IP
```

5. Open **http://127.0.0.1:3000** again.

The script checks the app and attempts to restore the old port if the health check fails. It **does not** make your server public. Actual DNS changes and SSL certificate management still require a separate HTTPS gateway.

Read the [Domain and Port Guide](docs/CONTROL-PANEL-NETWORK.md) for more details.

## 8. Everyday commands: start, stop, update

Run all commands in the VPS project's directory:

```bash
cd ~/VPS-MCP
```

| What you want | Command |
| --- | --- |
| See container status | `sudo bash scripts/status.sh` |
| Start again | `sudo docker compose up -d` |
| Stop the app | `sudo bash scripts/stop.sh` |
| Read recent error messages/logs | `sudo docker compose logs --tail=100 api` |
| Follow live logs | `sudo docker compose logs -f --tail=100 api` |
| Update the Docker app | `sudo bash scripts/update.sh` |
| Remove running services **without deleting data** | `sudo bash scripts/uninstall.sh` |

### How to update safely

First make a [backup](#9-backup-and-restore-your-data). Then, **on the VPS**:

```bash
cd ~/VPS-MCP
git status
git pull --ff-only
sudo bash scripts/update.sh
sudo docker compose ps
```

Do not use `git reset --hard` or delete `.env` to fix a failed update. The update script keeps your existing data volume.

## 9. Backup and restore your data

Your private data includes admin credentials, OAuth client records, permissions and audit logs. **Your GitHub repository does not contain this private data.**

### Make a backup

**On the VPS:**

```bash
cd ~/VPS-MCP
sudo bash scripts/backup.sh
```

This briefly stops the app, copies the private configuration and data into a backup folder, then starts it again. The command prints the folder location.

Example:

```text
backups/vps-mcp-YYYYMMDDTHHMMSSZ-NNNN/
  config.env
  data.tar.gz
```

**Important:** Backup files are **not encrypted** by the script. They contain sensitive information. Store them securely, and encrypt them before uploading them elsewhere.

### Restore a backup

Restore is for a **new, empty installation** only. It will refuse to overwrite a server that already has `.env` or a VPS-MCP data volume.

1. Prepare a new VPS with Docker and clone VPS-MCP.
2. **Do not run the normal installer** on this new destination.
3. Copy your verified backup to the new VPS using a secure method.
4. From the new VPS repository directory, run:

```bash
sudo bash scripts/restore.sh /FULL/PATH/TO/YOUR/BACKUP
```

You can then log in with the **same admin credentials** as before.

More information: [Private Installation and Recovery Guide](docs/PHASE-05-PRIVATE-INSTALL.md).

## 10. Common problems and solutions

| Problem | What to check |
| --- | --- |
| `docker: command not found` | Install Docker from Step 3 |
| `docker compose` does not work | Install the Docker Compose plugin |
| Dashboard does not open | Check the SSH tunnel, port 3000, and `sudo docker compose ps` |
| `http://VPS_IP:3000` does not open | Normal: the app is private. Use SSH forwarding |
| Setup token is rejected | Use the token printed during the **first installation**, not the sample password |
| `Pass@123` does not log in | It is **not** a valid default password. Use the one you created |
| A tool's ON switch is unavailable | That tool is not enabled by the server's security configuration |
| Domain was saved but HTTPS does not work | Domain/SSL settings are a **plan only** |
| Port changed and the page stopped opening | Update the **remote destination** in your PC's SSH tunnel |
| Installer refuses because `.env` is missing | Existing Docker data was found. Restore your original `.env` from backup; don't reset the data |
| ChatGPT cannot reach localhost | It needs a separately configured supported remote transport and OAuth |

**To inspect logs**, run **on the VPS**:

```bash
cd ~/VPS-MCP
sudo docker compose logs --tail=100 api
```

Never post your `.env` file, setup token, private backups, OAuth tokens, or admin password in a public support message.

## 11. Check that everything is working

**On the VPS**, run:

```bash
cd ~/VPS-MCP
sudo docker compose ps
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/api/setup/status
```

If you changed the **private host port**, replace `3000` in the **curl destination** with your new VPS host port; the app's internal origin still uses 3000.

Successful responses indicate the service is up and whether first-time setup is complete. Also check that you can log in through your PC's SSH tunnel.

For more technical checks (non-root container, read-only filesystem, no Docker socket), see the [Security Guide](docs/SECURITY.md).

## 12. Connecting ChatGPT or another AI client

### Can I connect ChatGPT immediately after installing?

**Not yet with the default installation.**

The dashboard works privately over SSH, but **ChatGPT runs in the cloud**. It cannot directly open your VPS's private `127.0.0.1` address.

There are two general ways to make an MCP server reachable:

| Method | Meaning | Status in VPS-MCP |
| --- | --- | --- |
| **Secure MCP Tunnel** | A supported outbound connection from your private server to OpenAI | Not bundled/configured or tested yet |
| **Public HTTPS MCP URL** | A real domain with valid HTTPS and working OAuth | Not deployed/tested yet |

**Even with a tunnel, this server's OAuth login/authorization flow must work from the connecting browser.** A tunnel alone does not automatically make the private login page reachable.

### What needs to be ready first?

Before adding VPS-MCP as a ChatGPT plugin:

1. Set up a **real and supported tunnel or public HTTPS connection**.
2. Verify that the MCP endpoint and OAuth authorization pages can be reached correctly.
3. Configure the **exact OAuth callback URL** shown by the AI client's connection flow.
4. Ensure client registration/permissions are enabled only when needed.
5. Test tool discovery and one **read-only** request.

**Current repository limitation:** These external HTTPS/OAuth steps require additional engineering. The automatic installer does **not** perform them. Do not expose port 3000 directly to the internet as a shortcut.

### After the remote connection has been correctly configured and tested

For eligible ChatGPT accounts/workspaces, on the **ChatGPT website**:

1. Open **Plugins** and choose **Add custom MCP server**.
2. Enter the server's **public HTTPS MCP URL** (including `/mcp`), or choose a configured **Tunnel**.
3. Set up authentication and review the permission warning.
4. Create the plugin and check the tools it discovers.
5. Try a safe request, such as: **“Use VPS-MCP to show system status.”**

*The steps above explain the future connection flow; they are not a promise that the current private Docker install is already accessible to ChatGPT.*

Official references:
- [Connect a custom MCP server in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [MCP connection and testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)

Other AI apps may use different menus, but they still need a compatible MCP transport, access permissions and authentication.

## 13. Important safety rules

- **Never share** your setup token, admin password, `.env`, session cookies or backup archives.
- **Do not** open the Docker port to all public IP addresses just to make AI connect.
- **Do not** mount the host `/var/run/docker.sock` into the web application.
- The default installation is **read-only** for AI tools. Advanced Docker/Git writes are intentionally disabled.
- Before upgrading, changing ports or migrating, **create a backup**.
- An ON switch in the dashboard cannot bypass a locked server feature.
- The current project is **CI-tested for private use**; live VPS and public ChatGPT integration have not been verified.

## 14. More detailed guides

You only need these if you want deeper technical details:

- [Private VPS installation, backup and restore](docs/PHASE-05-PRIVATE-INSTALL.md)
- [Sidebar, domain, DNS and port settings](docs/CONTROL-PANEL-NETWORK.md)
- [Advanced tool and client permissions](docs/ADVANCED-CONTROL-PANEL.md)
- [Security design and limitations](docs/SECURITY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Latest sidebar/network forensic audit](docs/SIDEBAR-NETWORK-FORENSIC-AUDIT-2026-10-28.md)
- [Full release audit](docs/FINAL-RELEASE-AUDIT.md)

---

**Need help?** Start with [Common problems and solutions](#10-common-problems-and-solutions), then copy only **non-sensitive** error messages from `sudo docker compose logs --tail=100 api`.

**Release scope:** Private Docker/SSH dashboard with read-only MCP tools. Public HTTPS, live ChatGPT connection and privileged server management are separate, unfinished integrations.
