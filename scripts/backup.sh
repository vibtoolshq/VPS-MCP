#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "Missing .env; cannot safely back up this installation." >&2; exit 1; }
docker compose ps --status running --services | grep -qx api || { echo "API container must be running for a consistent backup." >&2; exit 1; }
backup_root="${1:-$(pwd)/backups}"
mkdir -p "$backup_root"
backup_root="$(cd "$backup_root" && pwd -P)"
chmod 700 "$backup_root"
target="$backup_root/vps-mcp-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -m 700 "$target"
cp -- .env "$target/config.env"
chmod 600 "$target/config.env"
restart=true
restart_api(){
  if [[ "$restart" == true ]]; then
    docker compose start api >/dev/null || echo "WARNING: Restart API manually with: docker compose start api" >&2
  fi
}
trap restart_api EXIT
echo "Stopping API briefly for a consistent private-volume snapshot..."
docker compose stop api >/dev/null
docker compose run --rm --no-deps -T --entrypoint tar api -czf - -C /data . > "$target/data.tar.gz"
chmod 600 "$target/data.tar.gz"
tar -tzf "$target/data.tar.gz" >/dev/null
docker compose start api >/dev/null
restart=false
trap - EXIT
echo "Backup created privately in $target"
echo "Contains login hashes, OAuth credentials, policy and audit data: keep it encrypted and off-server."
