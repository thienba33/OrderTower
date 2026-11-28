<!-- SPDX-License-Identifier: Apache-2.0 -->
# Automation runtime

Lớp job chạy ngầm trong API, không thêm dịch vụ. Scheduler là interval nội bộ
(`AutomationScheduler`), mỗi job ghi `automation_runs` và có thể chạy tay từ
console quản trị.

## Job

| Job | Chu kỳ mặc định | Việc làm |
| --- | --- | --- |
| `outbox-relay` | 15 giây | Gọi `OutboxService.relay`, phát event pending; event lỗi retry backoff, quá `max_attempts` thành dead-letter |
| `sla-scan` | 60 giây | Quét workflow instance active quá hạn, tạo notification theo vai, escalation cho Quản lý sau 60 phút |
| `lakehouse-archive` | 24 giờ | Export đơn đã đóng quá retention ra Parquet trên SeaweedFS, ghi manifest; không xoá OLTP |

Không job nào tự chuyển trạng thái đơn/task/approval. Muốn đổi trạng thái vẫn
phải đi qua workflow + guard + audit như cũ.

## Cấu hình

- `AUTOMATION_ENABLED=1|0`
- `AUTOMATION_OUTBOX_INTERVAL_MS` (mặc định 15000, tối thiểu 5000)
- `AUTOMATION_SLA_INTERVAL_MS` (mặc định 60000, tối thiểu 5000)
- `AUTOMATION_ARCHIVE_INTERVAL_MS` (mặc định 86400000 = 24 giờ)
- `ARCHIVE_RETENTION_DAYS` (mặc định 0 cho demo; production 30–90)
- `ARCHIVE_LIMIT` (mặc định 500, tối đa 1000)

Khi `NODE_ENV=test`, scheduler không khởi động để unit test không chạy job.

## API

Chỉ Quản trị viên:

- `GET /api/automation/status`: scheduler bật/tắt, interval, run gần nhất.
- `GET /api/automation/runs?limit=20&offset=0`: run log phân trang, trả
  `{ items, total, limit, offset }`.
- `GET /api/automation/notifications?limit=20&offset=0`: notification toàn
  tenant, cùng dạng phân trang.
- `POST /api/automation/jobs/:job/run`: chạy tay `outbox-relay`, `sla-scan`
  hoặc `lakehouse-archive`.

Notification cho caller:

- `GET /api/notifications?unreadOnly=1&limit=50`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`

## SLA scan

Nguồn: `workflow_instances` active join `orders.deadline`.

- Vai nhận notification lấy từ transition hợp lệ của trạng thái hiện tại.
- Dedup key `sla:<instance>:<state>:<role>` nên quét lại không spam.
- Quá hạn ≥ 60 phút tạo thêm escalation `sla-escalated:<instance>:<state>`
  cho Quản lý; nếu vai xử lý đã là Quản lý thì bỏ qua escalation trùng.
- Notification có `action_href` để mở đơn.

## Lakehouse archive

- Gọi `ArchiveService.run` với caller hệ thống `system` / vai Quản trị viên.
- Chỉ chọn đơn ở trạng thái đã đóng, `updatedAt` cũ hơn retention và chưa có
  trong `order_archive_manifest`.
- Kết quả run log: `archived`, `runId`, `rows`, `bytes`, `cutoffAt`,
  `objectKey`; đơn gốc vẫn nằm trong OLTP.
- Chạy lại không trùng nhờ manifest.

## UI

- `/admin/automation`: KPI, trạng thái scheduler, run log phân trang 10 dòng,
  notification phân trang 8 dòng, chạy tay. Tự làm mới 30 giây và giữ trang
  đang xem.
- `/notifications`: hộp thư theo vai, lọc chưa đọc, đánh dấu đọc.
- Chuông trên header hiển thị số chưa đọc.

## Giới hạn

- Notification chỉ lưu trong DB; chưa gửi email/webhook/SMS.
- Chưa có dead-letter console riêng; requeue qua `POST /api/outbox/:id/retry`.
- SLA chỉ theo `orders.deadline`; chưa có SLA riêng cho approval/ticket.
- Dedup một lần/task/trạng thái/vai; sau khi người dùng đọc, job không nhắc
  lại nếu task vẫn quá hạn. Đổi trạng thái hoặc mở lại task sẽ tạo cảnh báo mới.
- Scheduler chạy ở tenant mặc định. Multi-tenant thật cần fan-out job theo
  từng tenant hoặc một scheduler tập trung ghi đúng `tenant_id`.
