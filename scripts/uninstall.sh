#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose down --remove-orphans
echo "Services removed. Private data volume and .env deliberately retained."
echo "Do not run docker compose down -v without a verified backup."
