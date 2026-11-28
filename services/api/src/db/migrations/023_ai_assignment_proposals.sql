-- SPDX-License-Identifier: Apache-2.0
-- Migration 023: đề xuất AI chia đơn kho (ai_assignment_proposals).
-- 1 đề xuất là 1 đợt chia: danh sách các mục (đơn + người nhận + lý do +
-- số đầu vào) lưu dạng JSON trong 1 cột TEXT, vì các mục không bao giờ
-- truy vấn riêng; cùng cách lưu với inputs của đề xuất BI. Không đặt khóa
-- ngoại, tham chiếu kiểm tra ở service (theo quy ước migration 010).
CREATE TABLE IF NOT EXISTS ai_assignment_proposals (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  items TEXT NOT NULL,
  skipped TEXT NOT NULL DEFAULT '[]',
  overloaded BOOLEAN NOT NULL DEFAULT FALSE,
  approval_id TEXT,
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_ai_assignment_proposals_status
  ON ai_assignment_proposals (status);
CREATE INDEX IF NOT EXISTS idx_ai_assignment_proposals_kind
  ON ai_assignment_proposals (kind);
