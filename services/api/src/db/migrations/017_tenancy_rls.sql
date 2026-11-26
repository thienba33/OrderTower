-- SPDX-License-Identifier: Apache-2.0
-- Migration 017: tenant_id cho dữ liệu nghiệp vụ.
-- Mặc định cột là 'default'; trên Postgres thật, trigger do DbService tạo
-- lúc khởi động sẽ gán tenant_id theo app.tenant_id của phiên hiện tại.
-- RLS policy cũng được DbService áp dụng lúc khởi động (pg-mem không hỗ trợ).
-- audit_log có tenant_id để truy vết nhưng giữ chuỗi hash toàn cục; không
-- bật RLS để /audit/verify còn kiểm tra được toàn bộ chuỗi.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE order_history
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE workflow_instance_history
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE shipment_history
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE delivery_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE restricted_flags
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE bi_recommendations
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE bi_feedback
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE dx_score_snapshots
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL
  DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_history_tenant ON order_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant ON workflow_instances (tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instance_history_tenant ON workflow_instance_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approvals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tenant ON shipments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipment_history_tenant ON shipment_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON vehicles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_drivers_tenant ON drivers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_tenant ON delivery_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels (tenant_id);
CREATE INDEX IF NOT EXISTS idx_returns_tenant ON returns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_assignments_tenant ON assignments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant ON call_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_restricted_flags_tenant ON restricted_flags (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bi_recommendations_tenant ON bi_recommendations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bi_feedback_tenant ON bi_feedback (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dx_score_snapshots_tenant ON dx_score_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_files_tenant ON files (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant ON outbox_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log (tenant_id);

-- Idempotency key và business key chỉ cần duy nhất trong từng tenant.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_tenant_idempotency
  ON orders (tenant_id, idempotency_key);
DROP INDEX IF EXISTS ux_workflow_instances_business_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_workflow_instances_tenant_business_key
  ON workflow_instances (tenant_id, definition_id, business_key);
