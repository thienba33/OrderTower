-- SPDX-License-Identifier: Apache-2.0
-- Migration 003: bảng lưu bền cho xe. Biển số duy nhất, trạng thái lọc
-- theo index. Khóa chính viết ở cuối bảng (PRIMARY KEY (...)) thay vì viết
-- ngay sau cột, để câu lệnh chạy được cả trên Postgres thật và trên pg-mem
-- dùng kiểm thử (xem chú thích trong src/db/migrations/002_shipments.sql).

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT NOT NULL,
  plate TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (plate)
);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles (status);
