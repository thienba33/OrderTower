#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Đọc secret từ OpenBao trước khi chạy API. OpenBao dev dùng token root;
# production phải thay bằng AppRole/token ngắn hạn + TLS.
set -eu

if [ "${OPENBAO_ENABLED:-0}" = "1" ]; then
  openbao_addr="${OPENBAO_ADDR:-http://openbao:8200}"
  openbao_token="${OPENBAO_TOKEN:-}"
  secret_path="${OPENBAO_SECRET_PATH:-secret/data/ordertower}"

  if response="$(curl -fsS -H "X-Vault-Token: ${openbao_token}" "${openbao_addr}/v1/${secret_path}")"; then
    value() {
      printf '%s' "$response" | jq -r ".data.data.${1} // empty"
    }
    database_url="$(value database_url)"
    s3_access_key="$(value s3_access_key)"
    s3_secret_key="$(value s3_secret_key)"

    [ -n "$database_url" ] && export DATABASE_URL="$database_url"
    [ -n "$s3_access_key" ] && export S3_ACCESS_KEY="$s3_access_key"
    [ -n "$s3_secret_key" ] && export S3_SECRET_KEY="$s3_secret_key"

    printf '%s\n' '{"level":"info","msg":"openbao.secrets.loaded","path":"'"${secret_path}"'"}'
  else
    printf '%s\n' '{"level":"error","msg":"openbao.secrets.failed"}'
    if [ "${OPENBAO_REQUIRED:-0}" = "1" ]; then
      exit 1
    fi
  fi
fi

exec "$@"
