#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "First run scripts/install.sh." >&2;exit 1; }
docker compose up -d --build
echo "Upgraded without removing credentials or persistent volumes."
