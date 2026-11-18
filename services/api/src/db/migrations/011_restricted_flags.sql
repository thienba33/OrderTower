-- SPDX-License-Identifier: Apache-2.0
-- Migration 011: bảng lưu bền cho cờ hạn chế (RestrictedFlag). Khóa chính
-- viết ở cuối bảng (PRIMARY KEY (...)) thay vì viết ngay sau cột, để câu
-- lệnh chạy được cả trên Postgres thật và trên pg-mem dùng kiểm thử (xem
-- chú thích trong src/db/migrations/002_shipments.sql).
-- order_id và customer_id KHÔNG có khóa ngoại: tham chiếu được kiểm tra ở
-- service (tạo cờ kiểm tra đơn có thật), không dựa vào ràng buộc DB, để
-- các mô-đun nối lỏng với nhau và không phụ thuộc thứ tự migration, giống
-- order_id ở bảng returns (xem 007_returns.sql).
-- Đơn có tối đa 1 cờ đang hoạt động cũng kiểm tra ở service, không bằng
-- ràng buộc DB, vì trạng thái đang hoạt động là 3 giá trị ("Hoàn nhiều
-- lần", "Chờ duyệt thêm", "Hạn chế") chứ không phải 1 hàng duy nhất theo
-- đơn.

CREATE TABLE IF NOT EXISTS restricted_flags (
  id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  customer_id TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  reason TEXT,
  created_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_restricted_flags_order_id ON restricted_flags (order_id);
CREATE INDEX IF NOT EXISTS idx_restricted_flags_status ON restricted_flags (status);
CREATE INDEX IF NOT EXISTS idx_restricted_flags_customer_phone ON restricted_flags (customer_phone);
