#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "Docker is required." >&2;exit 1; }
docker compose version >/dev/null || { echo "Docker Compose is required." >&2;exit 1; }
command -v openssl >/dev/null || { echo "OpenSSL is required for random setup tokens." >&2;exit 1; }
if [[ -e .env ]]; then
  echo "Existing secrets retained; updating the app without reset."
  docker compose up -d --build
  echo "Existing admin credentials and data are preserved."
  exit
fi
# Refuse to silently create fresh credentials over an existing persistent volume.
# A lost .env must be restored from backup, not treated as a fresh install.
volume_name="${COMPOSE_PROJECT_NAME:-vps-mcp}_mcp-data"
if docker volume inspect "$volume_name" >/dev/null 2>&1; then
  echo "Existing VPS-MCP Docker data volume found but .env is missing." >&2
  echo "Restore the original .env from backup before starting (no data was changed)." >&2
  exit 1
fi
setup_token="$(openssl rand -hex 32)"
setup_hash="$(printf '%s' "$setup_token" | openssl dgst -sha256 -r | awk '{print $1}')"
cat > .env <<EOF
# Auto-generated. No manual .env editing is required.
MCP_HOST=0.0.0.0
MCP_PORT=3000
MCP_BIND_PORT=3000
MCP_NETWORK_DRAFT_FILE=/data/network-draft.json
MCP_PUBLIC_URL=http://127.0.0.1:3000
MCP_PRIVATE_CONTAINER=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=
MCP_SETUP_TOKEN_HASH=$setup_hash
MCP_ADMIN_STATE_FILE=/data/admin.json
MCP_STATE_FILE=/data/oauth-state.json
MCP_CONTROL_FILE=/data/control.json
MCP_POLICY_FILE=/data/policy.json
MCP_AUDIT_FILE=/data/audit.jsonl
MCP_ALLOWED_TOOLS=system_status,disk_usage
MCP_ENABLE_WRITES=false
MCP_ALLOW_GIT_SYNC=false
OAUTH_ALLOWED_REDIRECT_URIS=
EOF
chmod 600 .env
cat <<EOF

=== VPS-MCP — ONE-TIME FIRST-LOGIN SETUP ===
Initial username suggestion: admin
Starter password example: Pass@123 (must change; never active)
Setup token: $setup_token

Keep this token private. It is printed only once and is not stored in plaintext.
EOF
echo "Building and starting the isolated localhost-only control panel..."
docker compose up -d --build
echo "Open http://127.0.0.1:3000 using SSH port forwarding; finish first-login setup."
