-- SPDX-License-Identifier: Apache-2.0
-- Migration 008: bảng lưu bền cho khách hàng (Customer), cộng cột
-- customer_id cho bảng orders. Khóa chính viết ở cuối bảng (PRIMARY KEY
-- (...)) thay vì viết ngay sau cột, để câu lệnh chạy được cả trên
-- Postgres thật và trên pg-mem dùng kiểm thử (xem chú thích trong
-- src/db/migrations/002_shipments.sql).
-- customer_id KHÔNG có khóa ngoại tới bảng customers: tham chiếu được
-- kiểm tra ở service (tạo đơn và sửa đơn kiểm tra khách có thật), không
-- dựa vào ràng buộc DB, để 2 mô đun Customer và Order nối lỏng với nhau
-- và không phụ thuộc thứ tự migration, giống vehicle_id ở bảng drivers
-- (xem 004_drivers.sql) và channel_id ở bảng orders (xem
-- 006_channels.sql). Đơn không bắt buộc có khách hàng nên cột để nullable.

CREATE TABLE IF NOT EXISTS customers (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (phone)
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
ALTER TABLE orders ADD COLUMN customer_id TEXT;
