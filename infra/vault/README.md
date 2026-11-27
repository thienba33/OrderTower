<!-- SPDX-License-Identifier: Apache-2.0 -->
# Vault dev

Vault dev server lưu secret local tại KV v2 path `secret/ordertower`. Chỉ dùng
cho dev/demo; production cần TLS, AppRole/token ngắn hạn, audit device và
storage bền vững.

## Luồng

```text
vault-init (seed secret) -> api entrypoint (đọc secret) -> node dist/main.js
```

- `vault` chạy `server -dev` với root token từ `VAULT_ROOT_TOKEN`.
- `vault-init` seed các khóa:
  - `database_url`
  - `s3_access_key`, `s3_secret_key`
  - `keycloak_admin_username`, `keycloak_admin_password`
  - `order_demo_password`
- API entrypoint đọc `secret/data/ordertower` khi `VAULT_ENABLED=1` và override
  `DATABASE_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`; nếu Vault lỗi thì fallback
  env (trừ khi `VAULT_REQUIRED=1`).
- Keycloak vẫn bootstrap bằng biến môi trường của container; secret admin trong
  Vault dùng cho thao tác/rotation, không được Keycloak tự đọc.

## Kiểm tra

```bash
docker compose up -d vault vault-init api
docker compose exec -T vault sh -lc \
  'VAULT_TOKEN="$VAULT_ROOT_TOKEN" vault kv get secret/ordertower'
docker compose logs api | grep vault.secrets.loaded
```

Tắt Vault cho API (fallback env):

```bash
VAULT_ENABLED=0 docker compose up -d api
```

## Rotate

1. Cập nhật secret trong Vault:
   ```bash
   docker compose exec -T vault sh -lc \
     'VAULT_TOKEN="$VAULT_ROOT_TOKEN" vault kv put secret/ordertower ...'
   ```
2. Restart API/consumer để entrypoint đọc lại.
3. Với DB/S3, rotate ở nguồn trước hoặc cùng lúc; API cũ có thể còn connection
   cũ đến khi restart.

## Production / HSM

- Không dùng root token/`server -dev`. Dùng Vault server có storage bền vững,
  TLS, AppRole + policy chỉ đọc đúng path, audit device.
- HSM (PKCS#11) là hạng mục dài hạn cho khóa mã hóa; bản này chưa triển khai,
  chỉ ghi nhận trong kế hoạch hardening.
- Không commit secret thật; `.env` chỉ là bootstrap local.
