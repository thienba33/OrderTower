-- SPDX-License-Identifier: Apache-2.0
-- Migration 006: bảng lưu bền cho kênh bán (Channel), cộng cột channel_id
-- cho bảng orders. Khóa chính viết ở cuối bảng (PRIMARY KEY (...)) thay
-- vì viết ngay sau cột, để câu lệnh chạy được cả trên Postgres thật và
-- trên pg-mem dùng kiểm thử (xem chú thích trong
-- src/db/migrations/002_shipments.sql).
-- channel_id KHÔNG có khóa ngoại tới bảng channels: tham chiếu được kiểm
-- tra ở service (tạo đơn và sửa đơn kiểm tra kênh có thật và đang hoạt
-- động), không dựa vào ràng buộc DB, để 2 mô đun Channel và Order nối
-- lỏng với nhau và không phụ thuộc thứ tự migration, giống vehicle_id ở
-- bảng drivers (xem 004_drivers.sql). Đơn không bắt buộc có kênh nên cột
-- để nullable.

CREATE TABLE IF NOT EXISTS channels (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels (status);
ALTER TABLE orders ADD COLUMN channel_id TEXT;
