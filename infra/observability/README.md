<!-- SPDX-License-Identifier: Apache-2.0 -->
# Observability local

## Prometheus + Grafana

`compose.yaml` chạy thêm:

- Prometheus: <http://localhost:9090>, scrape `api:3001/api/metrics` mỗi 15s.
- Grafana: <http://localhost:3002>, tài khoản lấy từ `GRAFANA_ADMIN_USER` /
  `GRAFANA_ADMIN_PASSWORD` (mặc định `admin`/`admin` cho local).

Datasource Prometheus và dashboard `OrderTower API` được provision tự động từ
`grafana/provisioning` và `grafana/dashboards`.

## Metrics API

`GET /api/metrics` trả Prometheus text:

- `http_requests_total{method,route,status}`
- `http_request_duration_seconds_sum/count{method,route}`
- `http_requests_in_flight`
- `app_info`

Route dùng pattern Express (`/api/orders`, `/api/orders/:id`) để tránh bùng nổ
cardinality; request không khớp route ghi `unmatched`.

## Request-id và JSON log

Middleware đọc `x-request-id` từ APISIX, tự sinh UUID nếu thiếu, trả lại header
và ghi JSON log ra stdout:

```json
{"time":"...","level":"info","msg":"http.request","requestId":"...","method":"GET","path":"/api/orders","route":"/api/orders","status":200,"durationMs":12.3,"tenantId":"default","user":"demo.dispatcher","ip":"..."}
```

APISIX đã bật plugin `request-id` cho các route; API giữ nguyên id đó để log
xuyên gateway.

## Backup/restore

```bash
./scripts/backup-postgres.sh
RESTORE_YES=1 ./scripts/restore-postgres.sh backups/ordertower-<timestamp>.dump
```

Script backup tạo file custom-format + SHA-256; restore dừng API trong lúc
restore rồi bật lại. Backup chỉ database ứng dụng `ordertower`; Keycloak có
database riêng.
