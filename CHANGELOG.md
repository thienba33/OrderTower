<!-- SPDX-License-Identifier: Apache-2.0 -->
# Changelog

Định dạng theo Keep a Changelog, phiên bản theo SemVer.

## [Unreleased]

### Added

- Khung khởi tạo của repo: cấu trúc thư mục, hồ sơ giấy phép, cấu hình hạ tầng, CI và dữ liệu mẫu.
- Luồng đơn tối thiểu và Workflow engine tách riêng khỏi API nghiệp vụ (PR #18): engine đọc định nghĩa luồng từ tệp JSON có phiên bản, 9 trạng thái và 10 chuyển trạng thái; audit log nối chuỗi hash SHA-256 có endpoint kiểm chứng; rào chắn tồn kho, độ tin cậy địa chỉ và hướng xử lý.
- Hạ tầng dữ liệu nền tảng (PR #19): Postgres 16 trong Compose, script khởi tạo tạo role `ordertower_app` và cơ sở dữ liệu `ordertower`.
- Củng cố Workflow engine (PR #20): thực thể WorkflowInstance với vòng đời riêng (tạm dừng, tiếp tục, kết thúc); xác thực JWT Keycloak qua JWKS và phân quyền theo vai trò; luồng phê duyệt cho sửa đơn đã đóng, người xin không tự duyệt, chỉ Quản lý và Quản trị viên duyệt, từ chối bắt buộc có lý do, 1 phê duyệt chỉ dùng 1 lần.
- Lưu bền Postgres (PR #21): đơn hàng, workflow instance, audit, phê duyệt và tồn kho lưu vào Postgres qua migration 001; khởi động lại API vẫn còn dữ liệu, đơn mới nối số đúng.
- Mô đun Shipment (PR #22): vòng đời shipment 5 trạng thái (Chờ điều xe, Đang giao, Đã giao, Giao thất bại, Đã hủy), điều xe kèm tài xế và xe, bằng chứng giao hàng bằng ảnh, lưu bền qua migration 002.
