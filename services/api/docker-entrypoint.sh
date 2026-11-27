#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Đọc secret từ Vault trước khi chạy API. Vault dev dùng token root; production
# phải thay bằng AppRole/token ngắn hạn + TLS.
set -eu

if [ "${VAULT_ENABLED:-0}" = "1" ]; then
  vault_addr="${VAULT_ADDR:-http://vault:8200}"
  vault_token="${VAULT_TOKEN:-}"
  secret_path="${VAULT_SECRET_PATH:-secret/data/ordertower}"

  if response="$(curl -fsS -H "X-Vault-Token: ${vault_token}" "${vault_addr}/v1/${secret_path}")"; then
    value() {
      printf '%s' "$response" | jq -r ".data.data.${1} // empty"
    }
    database_url="$(value database_url)"
    s3_access_key="$(value s3_access_key)"
    s3_secret_key="$(value s3_secret_key)"

    [ -n "$database_url" ] && export DATABASE_URL="$database_url"
    [ -n "$s3_access_key" ] && export S3_ACCESS_KEY="$s3_access_key"
    [ -n "$s3_secret_key" ] && export S3_SECRET_KEY="$s3_secret_key"

    printf '%s\n' '{"level":"info","msg":"vault.secrets.loaded","path":"'"${secret_path}"'"}'
  else
    printf '%s\n' '{"level":"error","msg":"vault.secrets.failed"}'
    if [ "${VAULT_REQUIRED:-0}" = "1" ]; then
      exit 1
    fi
  fi
fi

exec "$@"
