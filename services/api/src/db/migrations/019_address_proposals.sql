-- SPDX-License-Identifier: Apache-2.0
-- Migration 019: bảng lưu bền cho đề xuất chuẩn hóa địa chỉ (AI số 1,
-- xem bản dự thảo du-thao-ai-chuan-hoa-dia-chi.md mục 4.1).
-- address_proposals: 1 đề xuất chuẩn hóa cho 1 đơn, kèm địa chỉ trước/sau
-- và lý do từng phần; người duyệt quyết định 1 lần (áp dụng/từ chối).
-- before_json/after_json dùng JSONB, theo mẫu bi_recommendations ở
-- migration 012 (JSONB nhận chuỗi JSON, xem chú thích trong
-- services/api/src/orders/orders.store.ts). Khóa chính viết ở cuối bảng
-- (PRIMARY KEY (...)) để chạy được cả trên Postgres thật và trên pg-mem
-- dùng kiểm thử (xem chú thích trong
-- src/db/migrations/002_shipments.sql).
-- order_id KHÔNG có khóa ngoại: tham chiếu được kiểm tra ở service
-- (đề xuất chỉ tạo cho đơn có thật), không dựa vào ràng buộc DB, để các
-- mô-đun nối lỏng với nhau và không phụ thuộc thứ tự migration, giống
-- order_id ở bảng returns (xem 007_returns.sql) và bi_recommendations
-- (xem 012_bi.sql).

CREATE TABLE IF NOT EXISTS address_proposals (
  id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  before_json JSONB NOT NULL,
  after_json JSONB NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_address_proposals_order_id ON address_proposals (order_id);
CREATE INDEX IF NOT EXISTS idx_address_proposals_status ON address_proposals (status);
