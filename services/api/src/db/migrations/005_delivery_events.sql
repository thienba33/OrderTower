-- SPDX-License-Identifier: Apache-2.0
-- Migration 005: bảng lưu bền cho sự kiện giao hàng (DeliveryEvent).
-- Khóa chính viết ở cuối bảng (PRIMARY KEY (...)) thay vì viết ngay sau cột,
-- để câu lệnh chạy được cả trên Postgres thật và trên pg-mem dùng kiểm thử
-- (xem chú thích trong src/db/migrations/002_shipments.sql).
-- shipment_id và order_id KHÔNG có khóa ngoại tới bảng shipments hay orders:
-- tham chiếu được kiểm tra ở service (tạo sự kiện kiểm tra shipment có thật
-- và đang giao), không dựa vào ràng buộc DB, để mô-đun DeliveryEvent nối
-- lỏng với mô-đun Shipment và không phụ thuộc thứ tự migration, giống
-- vehicle_id ở bảng drivers (xem 004_drivers.sql). order_id ghi dư từ
-- shipment để lọc sự kiện theo đơn mà không cần nối bảng.
-- Cột at là thời điểm sự kiện xảy ra, created_at là thời điểm bản ghi được
-- tạo (2 mốc bằng nhau khi tạo, giữ cả 2 để phân biệt sự kiện với bản ghi
-- như ở bảng audit_log).

CREATE TABLE IF NOT EXISTS delivery_events (
  id TEXT NOT NULL,
  shipment_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  note TEXT,
  proof_photo_key TEXT,
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_events_shipment_id ON delivery_events (shipment_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_order_id ON delivery_events (order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_type ON delivery_events (type);
