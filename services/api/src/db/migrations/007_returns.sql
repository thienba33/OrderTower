-- SPDX-License-Identifier: Apache-2.0
-- Migration 007: bảng lưu bền cho trả hàng (Return). Khóa chính viết ở
-- cuối bảng (PRIMARY KEY (...)) thay vì viết ngay sau cột, để câu lệnh
-- chạy được cả trên Postgres thật và trên pg-mem dùng kiểm thử (xem chú
-- thích trong src/db/migrations/002_shipments.sql).
-- order_id KHÔNG có khóa ngoại tới bảng orders: tham chiếu được kiểm tra
-- ở service (tạo trả hàng kiểm tra đơn có thật và đã giao), không dựa
-- vào ràng buộc DB, để 2 mô đun Return và Order nối lỏng với nhau và
-- không phụ thuộc thứ tự migration, giống vehicle_id ở bảng drivers (xem
-- 004_drivers.sql) và channel_id ở bảng orders (xem 006_channels.sql).
-- Đơn có tối đa 1 trả hàng đang hoạt động cũng kiểm tra ở service, không
-- bằng ràng buộc DB, vì trạng thái đang hoạt động là 2 giá trị ("Chờ xử
-- lý", "Đã duyệt") chứ không phải 1 hàng duy nhất theo đơn.

CREATE TABLE IF NOT EXISTS returns (
  id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns (order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns (status);
