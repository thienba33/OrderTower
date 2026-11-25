<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun storage — dữ liệu phi cấu trúc

Cung cấp dịch vụ file dùng chung cho Tầng 1:

- `POST /api/files` — multipart, field `file`, `kind` (`proof_photo`, `document`,
  `invoice`, `attachment`), `orderId` (bắt buộc với `proof_photo`), `title`,
  `category`.
- `GET /api/files?orderId=&kind=&status=` — metadata; tài xế chỉ thấy file
  thuộc đơn có shipment của mình.
- `GET /api/files/:id` — metadata một file.
- `GET /api/files/:id/content` — tải nội dung; file `infected`/`deleted` bị chặn.
- `DELETE /api/files/:id` — xóa mềm, bắt buộc `reason`; chỉ chủ file hoặc
  manager/admin.

## Lưu trữ

- Metadata trong Postgres (`files`, migration `014_files.sql`).
- Nội dung trong SeaweedFS S3 qua `S3_ENDPOINT`, `S3_ACCESS_KEY`,
  `S3_SECRET_KEY`, `S3_BUCKET`; bucket được tạo khi API khởi động.
- Giới hạn 10 MiB; chỉ nhận JPEG/PNG/WebP/PDF.

## Kiểm dịch

- `ClamAvService` nói chuyện với clamd qua INSTREAM.
- `CLAMAV_ENABLED=true` để bật; `CLAMAV_REQUIRED=true` để fail-closed khi
  clamd lỗi. File nhiễm được lưu metadata `infected` để đối soát nhưng không
  tải được.
- Compose có service `clamav`; lần đầu có thể mất vài phút để tải signature.

## Bằng chứng giao hàng

- Tài xế upload ảnh `kind=proof_photo`, `orderId=<mã đơn>`.
- Gọi `POST /api/shipments/:id/deliver` với `proofPhotoFileId=<id>`.
- Shipment lưu cả `proof_photo_key` (object key) và `proof_photo_file_id`
  để tương thích dữ liệu cũ.
