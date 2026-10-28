# VPS-MCP

**Portable VPS management over Model Context Protocol (MCP)**, built with Node.js + TypeScript. The long-term goal is a reusable server that can run on any Ubuntu VPS using Docker Compose and connect to compatible MCP clients.

> **Current status — Phase 02: local, read-only MCP core.** This repository has a working *development* Streamable HTTP MCP server. It **does not yet have authentication, external HTTPS, a secure tunnel, Docker controls, shell access, or a production container**. Do not expose its endpoint publicly or route it through a public tunnel.

## Implemented in Phase 02

- Official `@modelcontextprotocol/server` v2 and stateless Streamable HTTP (JSON response mode).
- `GET /health` — local service health.
- `POST /mcp` — MCP initialize, tool discovery, and tool calls.
- `system_status` — CPU count, architecture, memory, uptime, load and Node.js version.
- `disk_usage` — filesystem statistics limited to `/` or `/tmp`; no arbitrary paths.
- Zod input schemas and SDK validation, read-only tool annotations.
- Explicit loopback-only binding (`127.0.0.1`), Host/Origin validation and no public listener.
- Local unit, protocol integration and negative-path tests, plus GitHub Actions checks.

These tools contain **no shell execution** and **no Docker socket access**. Only the modules above are active; the filesystem, Docker, deployment and security modules are future placeholders.

## Local development (Node.js 22+)

```bash
git clone https://github.com/vibtoolshq/VPS-MCP.git
cd VPS-MCP
npm install
npm run check
npm run dev
```

In another terminal **on the same machine**:

```bash
curl -fsS http://127.0.0.1:3000/health
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`; connect with a local compatible MCP client for protocol tests. The integration test uses the official MCP client SDK.

Build and run the compiled application:

```bash
npm run build
npm start
```

### Configuration

`MCP_HOST` is restricted to `127.0.0.1`; non-loopback hosts are rejected at startup. `MCP_PORT` defaults to `3000`, and `MCP_LOG_LEVEL` defaults to `info`. See `.env.example`.

Setting `MCP_HOST=0.0.0.0`, publishing the process through a reverse proxy/tunnel, or otherwise exposing this unauthenticated service is **unsupported and unsafe** in Phase 02.

## Project layout

```text
VPS-MCP/
├── README.md
├── .github/workflows/phase02.yml
├── .env.example
├── package.json
├── tsconfig.json
├── Dockerfile                 # intentionally NOT deployable yet
├── compose.yaml               # intentionally no services yet
├── config/permissions.example.json  # design only
├── src/
│   ├── index.ts                # development bootstrap
│   ├── server/
│   │   ├── mcp.ts              # live read-only tools
│   │   └── http.ts             # HTTP mounting, localhost guards and health
│   ├── tools/
│   │   ├── system.ts           # live metrics
│   │   ├── filesystem.ts       # future
│   │   ├── docker.ts           # future
│   │   └── deployment.ts       # future
│   ├── security/               # future auth/policy/audit
│   └── shared/config.ts        # validated environment
├── tests/
│   ├── config.test.ts
│   └── mcp.test.ts
├── scripts/
└── docs/
    ├── ARCHITECTURE.md
    ├── SECURITY.md
    └── ROADMAP.md
```

## Planned phases

1. **Phase 01 — Scaffold:** structure, README, architecture, security and roadmap. Complete.
2. **Phase 02 — Read-only MCP core:** SDK, HTTP, health, metrics, validation, tests. Implemented; CI status shown in GitHub Actions.
3. **Phase 03 — Secure remote access:** authentication, HTTPS/tunnel integration, authorization gates, audit and abuse-control tests.
4. **Phase 04 — Controlled operations:** optional limited filesystem, Docker and deployment operations with an isolated broker, approval model and tests.
5. **Phase 05 — Portable release:** hardened production Docker image/Compose, installer, lifecycle management, verification on a fresh VPS.

See [Roadmap](docs/ROADMAP.md) and [Security](docs/SECURITY.md).

## Docker and remote ChatGPT usage

**Not yet available.** `Dockerfile` and `compose.yaml` remain intentionally disabled until the final packaging phase. The local Phase 02 HTTP endpoint is not a URL to paste into ChatGPT. MCP client availability, authentication, and write permissions depend on the target product and account; no claim of universal ChatGPT compatibility is made.

## License

No license selected yet. Do not assume the public repository grants redistribution or modification permission.
