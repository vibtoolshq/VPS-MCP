# VPS-MCP

**Portable, security-first VPS management MCP server** — a planned Node.js + TypeScript application packaged with Docker Compose, intended to expose carefully scoped VPS management tools to compatible Model Context Protocol (MCP) clients such as ChatGPT.

> **Status: Structure and documentation only.** No MCP endpoint, authentication, terminal access, Docker control, installer, or deployment is implemented yet. **Do not deploy this repository as a working MCP server.**

## Goals

- Run on Ubuntu VPS instances using Docker Compose; avoid vendor lock-in.
- Keep the application portable across VPS providers and GitHub repositories.
- Use the official MCP TypeScript SDK and Streamable HTTP transport.
- Support secure remote access only after authentication, transport security, and auditing have been implemented and tested.
- Start with read-only diagnostics, then optionally enable tightly constrained write operations.
- Provide simple start, stop, upgrade, backup and uninstall procedures when implementation is complete.

## Proposed architecture

```text
ChatGPT / other compatible MCP client
           |
    HTTPS + authentication
           |
     secure proxy / tunnel
           |
  Node.js MCP Streamable HTTP
           |
   authorization + audit
           |
 allowlisted server tools
     |        |       |
  system    files   docker/deploy
```

**Client compatibility:** Connecting a custom MCP server, authentication options, and use of write tools depend on the specific ChatGPT account, workspace configuration, and current product support. A reusable server does **not** guarantee unrestricted control from every ChatGPT account.

## Repository layout

```text
VPS-MCP/
├── README.md
├── LICENSE                  # pending license choice (not added yet)
├── .gitignore
├── .dockerignore
├── .env.example
├── package.json
├── tsconfig.json
├── Dockerfile
├── compose.yaml
├── config/
│   └── permissions.example.json
├── src/
│   ├── index.ts
│   ├── server/
│   │   ├── mcp.ts
│   │   └── http.ts
│   ├── security/
│   │   ├── authentication.ts
│   │   ├── authorization.ts
│   │   └── audit.ts
│   ├── tools/
│   │   ├── system.ts
│   │   ├── filesystem.ts
│   │   ├── docker.ts
│   │   └── deployment.ts
│   └── shared/
│       └── config.ts
├── tests/
│   └── README.md
├── scripts/
│   └── README.md
└── docs/
    ├── ARCHITECTURE.md
    ├── SECURITY.md
    └── ROADMAP.md
```

The tracked TypeScript files are **intentional non-executable placeholders** for module boundaries. Runtime configuration is a draft; no services are started by this scaffold.

## Planned MCP tools

| Module | Planned capabilities | Initial policy |
| --- | --- | --- |
| System | CPU, memory, disk, uptime, service status | Read-only |
| Filesystem | List/read within explicitly allowed directories | Read-only |
| Docker | Inspect containers and logs | Read-only |
| Deployment | Inspect repository and deployment status | Read-only |
| Elevated actions | Restricted file edits, deploy, service/container changes | Disabled until explicit policy and review |

No arbitrary shell command execution or unrestricted Docker socket access is included in the baseline.

## Security design principles

1. Run the application as a dedicated non-root user, with a read-only container filesystem where possible.
2. Do **not** publish an unauthenticated MCP endpoint to the internet.
3. Use authenticated HTTPS or an access-controlled tunnel and validate access to **every** tool.
4. Deny privileged operations by default, enforce explicit file path and command allowlists, and require approval for destructive actions.
5. Do not mount `/var/run/docker.sock` into a publicly reachable MCP container. Use an isolated, narrowly scoped broker if Docker write actions are added.
6. Never commit secrets. Configure runtime credentials outside version control, rotate/revoke them, and redact audit logs.
7. Test remote connections, authorization failures, prompt-injection resistance, rate limits and safe shutdown before production use.

See [Security](docs/SECURITY.md).

## Getting started (current stage)

Clone to inspect the scaffold:

```bash
git clone https://github.com/vibtoolshq/VPS-MCP.git
cd VPS-MCP
```

**There is no runnable MCP server yet.** The Dockerfile and Compose file intentionally cannot start an application until the implementation phase. The environment example is not a ready-to-use production configuration.

## Development phases

1. **Scaffold** — structure, README, architecture, security policy, roadmap. (This commit)
2. **Read-only MCP core** — SDK, Streamable HTTP, health checks, strict input validation, tests.
3. **Remote access hardening** — authentication, authorized HTTPS/tunnel, policy and audit tests.
4. **Controlled operations** — optional restricted tools with explicit permissions and secure execution broker.
5. **Portable release** — working Docker image/Compose, installation guides, CI, real VPS verification.

See [Roadmap](docs/ROADMAP.md).

## Operations (future)

Once the runtime is implemented and verified, the intended lifecycle commands will be:

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

**These commands are documentation of the intended interface, not instructions to run this scaffold today.**

## Costs and portability

The project aims to be self-hosted on an existing VPS without requiring an additional VPS subscription. VPS resources, domains, tunnel service, ChatGPT account eligibility, and API or third-party service charges may still apply.

## License

No license has been selected. Until a license file is added, do not assume this repository grants third-party redistribution or modification rights.

## Project status

- [x] Repository structure and planning docs
- [ ] Working MCP server
- [ ] Authentication and remote connection
- [ ] Tool implementation
- [ ] Docker image and production deployment
- [ ] Security tests and release
