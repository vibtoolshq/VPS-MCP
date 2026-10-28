# VPS-MCP Phase 04 Architecture

```text
ChatGPT / MCP client                    Verified admin browser
OAuth vps:read / optional vps:write      Session + CSRF
           |                                      |
           |  HTTPS / local service               |
           +--------- MCP HTTP application -------+
                         |               |
              scoped tool context   Pending approvals
                         |               |
                read-only tools     Admin approve/deny
                         |
                  write proposals
                         |
               exact approved operation
                         |
             private Unix domain socket
                   + shared secret
                         |
               Separate restricted broker
                  /      |       \
       file.create  docker.restart  deploy.sync
       private root  allowlisted     trusted repo,
                     container      branch, opt-in
```

## Security boundaries

MCP client tokens require `vps:read`; `vps:write` is additional and only available when explicitly enabled. Read tools appear only in `MCP_ALLOWED_TOOLS`. Approval tools are registered only with the write flag, broker configuration and both tool names. An operation is fixed when proposed; the client cannot alter payload during execution. The panel displays a summary and requires a logged-in admin + CSRF token. Approved operations are consumed once before dispatch.

The server **never opens the Docker daemon socket**. It delegates a strictly enumerated operation to a separate process over an OS-protected Unix socket using a secret. Broker operations are revalidated and use `execFile` with an explicit argument array and no shell. The broker must be launched under a separately restricted OS service identity in Phase 05.

## Filesystem policy

User-controlled paths must be relative and cannot include hidden path components, `..`, symlinks or a leading slash. Read limit 64 KiB; create limit 16 KiB, exclusive creation mode `0600`, no overwrite. The workspace directory must not be writable by untrusted local users, because path traversal checks alone do not guarantee race-free access against a malicious local writer.

## Docker and deployment policies

Docker status reports only allowlisted container state, not environment variables, secrets or full inspect payloads. Docker restart is limited to explicit container names. Git status reports a revision and dirty-file count; sync is disabled unless an extra opt-in is provided. `git pull --ff-only` has no arbitrary client-provided arguments, but repository configuration or malicious source code still poses risk: use only trusted repositories and a minimally privileged service identity.

## Deployment state

Production Dockerfile/Compose still deliberately disabled. Running a development broker with production Docker permissions is not the approved release configuration. Phase 05: restricted OS user/groups, sockets, ACLs, production container profiles, install/stop/update/uninstall and live tests.
