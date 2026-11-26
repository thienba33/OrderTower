-- SPDX-License-Identifier: Apache-2.0
-- Migration 010: bảng lưu bền cho phân đơn (Assignment) và nhật ký cuộc
-- gọi (CallLog). Khóa chính viết ở cuối bảng (PRIMARY KEY (...)) thay vì
-- viết ngay sau cột, để câu lệnh chạy được cả trên Postgres thật và trên
-- pg-mem dùng kiểm thử (xem chú thích trong
-- src/db/migrations/002_shipments.sql).
-- order_id và assignment_id KHÔNG có khóa ngoại: tham chiếu được kiểm tra
-- ở service (tạo phân đơn kiểm tra đơn có thật, tạo nhật ký kiểm tra phân
-- đơn có thật), không dựa vào ràng buộc DB, để các mô-đun nối lỏng với
-- nhau và không phụ thuộc thứ tự migration, giống order_id ở bảng returns
-- (xem 007_returns.sql).
-- Đơn có tối đa 1 phân đơn đang hoạt động theo từng loại (telesale hoặc
-- kho) cũng kiểm tra ở service, không bằng ràng buộc DB, vì trạng thái
-- đang hoạt động là 2 giá trị ("Chờ xử lý", "Đang xử lý") chứ không phải
-- 1 hàng duy nhất theo đơn và loại.

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  status TEXT NOT NULL,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_order_id ON assignments (order_id);
CREATE INDEX IF NOT EXISTS idx_assignments_assigned_to ON assignments (assigned_to);
CREATE INDEX IF NOT EXISTS idx_assignments_kind ON assignments (kind);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments (status);

CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  caller TEXT NOT NULL,
  result TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_call_logs_assignment_id ON call_logs (assignment_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_order_id ON call_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON call_logs (caller);
