-- SPDX-License-Identifier: Apache-2.0
-- Migration 004: bảng lưu bền cho tài xế. username (tên đăng nhập
-- Keycloak) và phone đều duy nhất, trạng thái lọc theo index. Khóa chính
-- viết ở cuối bảng (PRIMARY KEY (...)) thay vì viết ngay sau cột, để câu
-- lệnh chạy được cả trên Postgres thật và trên pg-mem dùng kiểm thử (xem
-- chú thích trong src/db/migrations/002_shipments.sql).
-- vehicle_id KHÔNG có khóa ngoại tới bảng vehicles: tham chiếu được kiểm
-- tra ở service (gán xe kiểm tra xe có thật, dispatch kiểm tra tài xế có
-- thật), không dựa vào ràng buộc DB, để 2 mô đun Driver và Vehicle nối
-- lỏng với nhau và không phụ thuộc thứ tự migration.

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  username TEXT NOT NULL,
  vehicle_id TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (username),
  UNIQUE (phone)
);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers (status);
