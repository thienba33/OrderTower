<!-- SPDX-License-Identifier: Apache-2.0 -->
# Lakehouse-lite — archive đơn đã đóng

Module này tách dữ liệu lịch sử khỏi OLTP theo nguyên lý hot/cold:

```text
Postgres OLTP (hot)
  └── archive job đọc đơn đã đóng
        └── Parquet trên SeaweedFS (cold)
              └── analytics đọc Parquet, không truy vấn OLTP
```

## Endpoint

| Endpoint | Quyền | Mô tả |
|---|---|---|
| `POST /api/archive/orders/run` | Quản trị/Quản lý | Archive đơn đã đóng; body `{ olderThanDays, limit }` |
| `GET /api/archive/runs?limit=` | Quản trị/Quản lý | Lịch sử run |
| `GET /api/archive/summary` | Quản trị/Quản lý | Số đơn OLTP/đã archive, số run, dung lượng cold |
| `GET /api/archive/orders/analytics?from=&to=&channelId=&limit=` | Quản trị/Quản lý | Đọc Parquet, tổng hợp theo state/channel/ngày |

`olderThanDays` mặc định `0` để demo archive toàn bộ đơn đã đóng. Production
nên đặt 30–90 ngày và chạy theo lịch.

## Dữ liệu Parquet

Mỗi file là một run, path:

```text
warehouse/tenants/<tenant>/orders/cutoff=<YYYY-MM-DD>/run=<AR-...>.parquet
```

Cột: `tenant_id`, `order_id`, `state`, `created_at`, `updated_at`, `total`,
`channel_id`, `customer_id`, `item_count`, `items_json`.

Không export `phone`, `address`, tên khách hàng hay audit detail — tránh PII
thô trong cold data. `items_json` chỉ có SKU + quantity.

## Chống archive trùng

`order_archive_manifest` đánh dấu từng `order_id` đã export. Lần chạy sau bỏ
qua các đơn đã có trong manifest. `archive_runs` lưu run completed/failed,
row count, bytes, object key và lỗi.

## Hot/cold

- Đơn gốc **vẫn nằm trong OLTP** để không phá workflow, audit, khóa ngoại.
- Cold analytics chỉ đọc Parquet qua `ObjectStorage`; không gọi
  `OrdersService.list()`.
- Muốn xoá hẳn khỏi OLTP cần thêm retention/partitioning; bản này chưa làm.

## Giới hạn đã biết

- Chưa có scheduler; archive chạy tay qua API/UI.
- Chưa dùng Iceberg/Trino/DuckDB; Parquet đọc bằng `parquetjs-lite`.
- Analytics đọc toàn bộ run completed; với dữ liệu lớn cần partition/catalog.
- Chưa có compaction hay lifecycle policy cho object storage.
