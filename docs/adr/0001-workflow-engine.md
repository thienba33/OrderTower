<!-- SPDX-License-Identifier: Apache-2.0 -->
# ADR-0001: Workflow engine dạng mô-đun NestJS riêng

- Trạng thái: Đã chấp nhận.
- Ngày: 02/11/2026.

## Bối cảnh

Workflow engine tách riêng khỏi code API nghiệp vụ. Định nghĩa luồng dạng
tệp có phiên bản, có lịch sử, phê duyệt, quay lui và từ chối chuyển trạng
thái trái phép.

## Quyết định

Viết Workflow engine thành mô-đun riêng trong dịch vụ NestJS, định nghĩa
luồng dạng tệp JSON có phiên bản, engine đọc tệp để quyết định.

## Hệ quả

- Ưu điểm: 1 runtime, 1 Postgres, 1 bộ test, không thêm ngôn ngữ mới.
- Nhược điểm: đội phải tự chứng minh lịch sử, phê duyệt, quay lui và phiên
  bản định nghĩa, không có sẵn như engine chuyên dụng.
- Bài kiểm tra bắt buộc: đổi tệp định nghĩa, khởi động lại engine, luồng mới
  chạy được mà không sửa code API; chuyển trạng thái trái phép bị từ chối
  kèm log. Nếu engine không đạt bài kiểm tra này, dự án chuyển sang
  Flowable.

## Phương án khác đã xem

Flowable (engine mở, Apache 2.0, Java, BPMN 2.0).
