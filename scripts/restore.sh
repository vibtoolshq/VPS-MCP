#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
source_dir="${1:?Usage: bash scripts/restore.sh /path/to/verified-private-backup-directory}"
[[ -d "$source_dir" ]] || { echo "Backup directory missing." >&2; exit 1; }
source_dir="$(cd "$source_dir" && pwd -P)"
bash scripts/check-backup.sh "$source_dir"
[[ ! -e .env ]] || { echo "Existing .env found; refusing to overwrite a running or previously configured installation." >&2;exit 1; }
volume_name="${COMPOSE_PROJECT_NAME:-vps-mcp}_mcp-data"
if docker volume inspect "$volume_name" >/dev/null 2>&1;then
 echo "Existing VPS-MCP data volume found; restore refuses to overwrite any data." >&2
 exit 1
fi
# Accept only the application-generated private state files and directories.
while IFS= read -r entry; do
 case "$entry" in
   './'|'./admin.json'|'./admin.json.complete'|'./oauth-state.json'|'./control.json'|'./policy.json'|'./audit.jsonl') ;;
   *) echo "Backup contains an unexpected path; refusing restore." >&2;exit 1;;
 esac
done < <(tar -tzf "$source_dir/data.tar.gz")
if tar -tvzf "$source_dir/data.tar.gz" | grep -Eq '^[^d-]';then
 echo "Backup contains a special file or link; refusing restore." >&2
 exit 1
fi
if ! tar -tzf "$source_dir/data.tar.gz" | grep -qx './admin.json';then
 echo "Backup does not contain the required admin account state." >&2
 exit 1
fi
cp -- "$source_dir/config.env" .env
chmod 600 .env
if ! grep -qx 'MCP_PRIVATE_CONTAINER=true' .env;then
 echo "Backup is not from the isolated private installation; refusing." >&2
 rm -f .env
 exit 1
fi
# Newly created volume only; pre-existing volumes are always refused above.
docker compose build api
docker compose up --no-deps init-data
cat "$source_dir/data.tar.gz" | docker compose run --rm --no-deps -T --entrypoint tar api -xz -C /data
docker compose up -d --build
echo "Private backup restored to a previously empty VPS-MCP data volume."
echo "Use your existing admin credentials. The old one-time setup token is NOT reissued."
