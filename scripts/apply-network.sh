#!/usr/bin/env bash
# Apply ONLY a validated localhost Docker host-port draft. Domain/TLS are NEVER
# applied by this script: a trusted external HTTPS gateway needs separate setup.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "Install VPS-MCP first." >&2; exit 1; }
grep -qx 'MCP_PRIVATE_CONTAINER=true' .env || { echo "Private Compose installation required." >&2; exit 1; }
command -v flock >/dev/null || { echo 'flock is required to prevent concurrent port applies.' >&2; exit 1; }
exec 9>.network-apply.lock
flock -n 9 || { echo 'Another port change is already in progress.' >&2; exit 1; }
port="$(docker compose exec -T api node -e '
const fs=require("node:fs");
const data=JSON.parse(fs.readFileSync("/data/network-draft.json","utf8"));
if(data.version!==1 || !Number.isInteger(data.hostPort) || data.hostPort<1024 || data.hostPort>65535)process.exit(2);
process.stdout.write(String(data.hostPort));
' | tr -d '\r')"
[[ "$port" =~ ^[0-9]{4,5}$ ]] && ((port>=1024 && port<=65535)) || { echo "Invalid port draft." >&2;exit 1; }
previous="$(grep '^MCP_BIND_PORT=' .env | tail -1 | cut -d= -f2 || true)"
previous="${previous:-3000}"
if [[ "$previous" == "$port" ]]; then echo "Private host port already set to $port. Nothing changed.";exit 0;fi
echo "Changing PRIVATE host port $previous -> $port. Host binding stays 127.0.0.1."
echo "Your SSH tunnel's destination port must be $port afterwards (PC source port stays 3000)."
backup="$(mktemp)"
cp -- .env "$backup"
rollback(){
 rc=$?
 if ((rc!=0));then
   echo "Port health check failed; restoring prior .env and Compose binding." >&2
   cp -- "$backup" .env
   chmod 600 .env
   docker compose up -d --no-build || true
 fi
 rm -f "$backup"
}
trap rollback EXIT
temp="$(mktemp)"
awk -v p="$port" 'BEGIN{found=0}
  /^MCP_BIND_PORT=/{if(!found){print "MCP_BIND_PORT="p;found=1};next}
  {print}
  END{if(!found) print "MCP_BIND_PORT="p}' .env > "$temp"
chmod 600 "$temp"
mv "$temp" .env
docker compose up -d --no-build
healthy=false
for _ in $(seq 1 30);do
 if curl -fsS --max-time 2 -H 'Host: 127.0.0.1:3000' "http://127.0.0.1:$port/health" >/dev/null 2>&1;then healthy=true;break;fi
 sleep 1
done
[[ "$healthy" == true ]] || exit 1
echo "Private host port now applied: 127.0.0.1:$port."
echo "On your PC: ssh -N -L 3000:127.0.0.1:$port ubuntu@YOUR_VPS_IP"
echo "Domain/DNS and SSL certificate changes remain UNAPPLIED until a separate trusted HTTPS gateway is configured."
