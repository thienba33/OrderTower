<!-- SPDX-License-Identifier: Apache-2.0 -->
# Outbox và bộ đếm ID

## Outbox

`outbox_events` ghi sự kiện nghiệp vụ trong **cùng transaction** với thay đổi
order/instance/audit/tồn kho. Nếu một bước lỗi, event cũng rollback; không có
event "mồ côi" trỏ tới thay đổi chưa xảy ra.

Event hiện có:

- `order.created`
- `order.transitioned`
- `inventory.reserved`

Mỗi event gồm `event_type`, `aggregate_type`, `aggregate_id`, `payload`,
`status` (`pending`, `processed`, `failed`), `attempts`, `max_attempts`,
`next_attempt_at`, `created_at`, `processed_at`, `last_error`.

Retry: event lỗi được đẩy `next_attempt_at` theo backoff 30/60/90/120/150 giây.
Sau `max_attempts` (mặc định 5) event thành `failed` (dead-letter) và có thể
đưa lại hàng đợi.

API (chỉ Quản trị viên/Quản lý):

- `GET /api/outbox?status=pending&type=order.created&limit=100`
- `POST /api/outbox/relay?limit=100`: phát event pending đã đến hạn, trả
  `{ processed, retried, failed, eventIds }`.
- `POST /api/outbox/:id/retry`: requeue event `failed`.

Job `outbox-relay` trong `automation/` gọi relay mỗi 15 giây, nên không cần
bấm tay. Chưa cắm broker thật; khi có NATS/Kafka/webhook, thay phần publish
trong `OutboxService.relay` và giữ nguyên phần ghi event trong transaction.

## Bộ đếm ID

Bảng `id_counters` cấp số nguyên tử cho `DH-*`, `LS-*`, `WF-*` qua
`IdSequenceService`. Câu lệnh dùng `INSERT ... ON CONFLICT DO UPDATE ...
RETURNING` nên nhiều request đồng thời không nhận cùng một số. Khi DB được
restore từ bản có ID lớn hơn counter, `GREATEST` đẩy counter lên để không cấp
trùng.

Bộ đếm trong bộ nhớ vẫn được dùng khi service được dựng thủ công trong unit
test không có `DbService`.

## Migration

`016_transactions_outbox.sql` tạo `id_counters`, `outbox_events` và unique
index `(definition_id, business_key)` cho workflow instance.
