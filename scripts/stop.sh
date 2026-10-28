#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose down
echo "Services stopped. The persistent volume and private .env remain intact."
