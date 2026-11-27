# SPDX-License-Identifier: Apache-2.0
# Seed KV v2 cho local. Chỉ dùng Vault dev; production dùng AppRole + TLS.
set -eu

export VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
: "${VAULT_TOKEN:?VAULT_TOKEN is required}"

echo "Chờ Vault sẵn sàng..."
until vault status >/dev/null 2>&1; do
  sleep 1
done

vault kv put secret/ordertower \
  database_url="${DATABASE_URL:?DATABASE_URL is required}" \
  s3_access_key="${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}" \
  s3_secret_key="${S3_SECRET_KEY:?S3_SECRET_KEY is required}" \
  keycloak_admin_username="${KEYCLOAK_ADMIN_USERNAME:-admin}" \
  keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}" \
  order_demo_password="${ORDERTOWER_DEMO_PASSWORD:?ORDERTOWER_DEMO_PASSWORD is required}" \
  >/dev/null

echo "Đã seed secret/ordertower."
