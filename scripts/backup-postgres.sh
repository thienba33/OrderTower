#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Backup PostgreSQL của OrderTower bằng pg_dump custom format + SHA-256.
# Dùng: ./scripts/backup-postgres.sh
# Env: BACKUP_DIR (mặc định backups), POSTGRES_USER, POSTGRES_DB.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${BACKUP_DIR:-backups}"
POSTGRES_USER="${POSTGRES_USER:-ordertower}"
POSTGRES_DB="${POSTGRES_DB:-ordertower}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/${POSTGRES_DB}-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"
echo "Đang backup database ${POSTGRES_DB}..."
docker compose exec -T postgres \
  pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom \
  > "$FILE"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FILE" > "$FILE.sha256"
else
  shasum -a 256 "$FILE" > "$FILE.sha256"
fi

echo "Đã tạo: $FILE"
echo "Checksum: $FILE.sha256"
