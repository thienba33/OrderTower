<!-- SPDX-License-Identifier: Apache-2.0 -->
# OpenBao dev

OpenBao dev server lưu secret local tại KV v2 path `secret/ordertower`. Chỉ dùng
cho dev/demo; production cần TLS, AppRole/token ngắn hạn, audit device và
storage bền vững.

OpenBao là fork cộng đồng của Vault, giấy phép MPL 2.0. API KV v2 và CLI `bao`
tương thích với Vault; dự án dùng OpenBao thay Vault để giữ lõi nguồn mở.

## Luồng

```text
openbao-init (seed secret) -> api entrypoint (đọc secret) -> node dist/main.js
```

- `openbao` chạy `server -dev` với root token từ `OPENBAO_ROOT_TOKEN`.
- `openbao-init` seed các khóa:
  - `database_url`
  - `s3_access_key`, `s3_secret_key`
  - `keycloak_admin_username`, `keycloak_admin_password`
  - `order_demo_password`
- API entrypoint đọc `secret/data/ordertower` khi `OPENBAO_ENABLED=1` và override
  `DATABASE_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`; nếu OpenBao lỗi thì fallback
  env (trừ khi `OPENBAO_REQUIRED=1`).
- Keycloak vẫn bootstrap bằng biến môi trường của container; secret admin trong
  OpenBao dùng cho thao tác/rotation, không được Keycloak tự đọc.

## Kiểm tra

```bash
docker compose up -d openbao openbao-init api
docker compose exec -T openbao sh -lc \
  'BAO_ADDR=http://127.0.0.1:8200 BAO_TOKEN="$BAO_TOKEN" bao kv get secret/ordertower'
docker compose logs api | grep openbao.secrets.loaded
```

Tắt OpenBao cho API (fallback env):

```bash
OPENBAO_ENABLED=0 docker compose up -d api
```

## Rotate

1. Cập nhật secret trong OpenBao:
   ```bash
   docker compose exec -T openbao sh -lc \
     'BAO_ADDR=http://127.0.0.1:8200 BAO_TOKEN="$BAO_TOKEN" bao kv put secret/ordertower ...'
   ```
2. Restart API/consumer để entrypoint đọc lại.
3. Với DB/S3, rotate ở nguồn trước hoặc cùng lúc; API cũ có thể còn connection
   cũ đến khi restart.

## Production / HSM

- Không dùng root token/`server -dev`. Dùng OpenBao server có storage bền vững,
  TLS, AppRole + policy chỉ đọc đúng path, audit device.
- HSM (PKCS#11) là hạng mục dài hạn cho khóa mã hóa; bản này chưa triển khai,
  chỉ ghi nhận trong kế hoạch hardening.
- Không commit secret thật; `.env` chỉ là bootstrap local.
