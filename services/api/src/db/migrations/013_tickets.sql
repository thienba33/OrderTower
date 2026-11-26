-- SPDX-License-Identifier: Apache-2.0
-- Migration 013: bảng lưu bền cho ticket CSKH (Ticket). Khóa chính viết
-- ở cuối bảng (PRIMARY KEY (...)) thay vì viết ngay sau cột, để câu lệnh
-- chạy được cả trên Postgres thật và trên pg-mem dùng kiểm thử (xem chú
-- thích trong src/db/migrations/002_shipments.sql).
-- order_id KHÔNG có khóa ngoại: 14 dòng mẫu tham chiếu DH-1015 đến
-- DH-1058, không tồn tại trong seed đơn (DH-1001..DH-1008 và
-- LS-1001..LS-1112), nên mã đơn chỉ là chuỗi tự do, kiểm tra ở service
-- không dựa vào ràng buộc DB, giống order_id ở bảng returns (xem
-- 007_returns.sql) và bảng restricted_flags (xem 011_restricted_flags.sql).
-- closed_at chỉ có giá trị khi ticket ở trạng thái "Đã đóng"; KPI "Đã
-- đóng hôm nay" đếm theo trường này.

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT NOT NULL,
  customer TEXT NOT NULL,
  order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  handler TEXT NOT NULL,
  needs_call BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets (type);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets (order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_needs_call ON tickets (needs_call);
