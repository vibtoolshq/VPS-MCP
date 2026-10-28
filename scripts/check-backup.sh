#!/usr/bin/env bash
set -euo pipefail
backup="${1:?Usage: bash scripts/check-backup.sh /path/to/private-backup-directory}"
[[ -f "$backup/config.env" && -f "$backup/data.tar.gz" ]] ||
  { echo "Missing backup components" >&2;exit 1; }
[[ "$(stat -c '%a' "$backup/config.env")" == 600 ]] ||
  { echo "Backup config is not private" >&2;exit 1; }
[[ "$(stat -c '%a' "$backup/data.tar.gz")" == 600 ]] ||
  { echo "Backup archive is not private" >&2;exit 1; }
tar -tzf "$backup/data.tar.gz" >/dev/null
echo "Backup archive and private file permissions verified. Restore not performed."
