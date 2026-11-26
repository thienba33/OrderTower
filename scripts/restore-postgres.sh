#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Restore PostgreSQL của OrderTower từ file pg_dump custom format.
# Dùng: RESTORE_YES=1 ./scripts/restore-postgres.sh backups/ordertower-*.dump
# Script dừng API trong lúc restore rồi bật lại (trừ khi RESTORE_KEEP_API=1).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FILE="${1:?Cách dùng: RESTORE_YES=1 ./scripts/restore-postgres.sh <file.dump>}"
POSTGRES_USER="${POSTGRES_USER:-ordertower}"
POSTGRES_DB="${POSTGRES_DB:-ordertower}"

if [ "${RESTORE_YES:-}" != "1" ]; then
  echo "Từ chối restore vì chưa đặt RESTORE_YES=1." >&2
  echo "Lệnh đúng: RESTORE_YES=1 $0 $FILE" >&2
  exit 1
fi
if [ ! -f "$FILE" ]; then
  echo "Không tìm thấy file backup: $FILE" >&2
  exit 1
fi

started_api=0
if [ "${RESTORE_KEEP_API:-}" != "1" ]; then
  echo "Dừng API để tránh kết nối đang mở..."
  docker compose stop api >/dev/null
  started_api=1
fi

cleanup() {
  if [ "$started_api" = "1" ]; then
    echo "Bật lại API..."
    docker compose start api >/dev/null
  fi
}
trap cleanup EXIT

echo "Đang restore ${FILE} vào database ${POSTGRES_DB}..."
docker compose exec -T postgres \
  pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-acl < "$FILE"

echo "Restore xong."
