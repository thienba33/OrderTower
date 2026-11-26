-- SPDX-License-Identifier: Apache-2.0
-- Migration 015: version đang active của workflow definition.
-- Definition vẫn nằm trong file JSON có version; bảng này lưu con trỏ active
-- sau khi một deployment được duyệt, để restart API không quay về bản cũ.

CREATE TABLE IF NOT EXISTS workflow_active_versions (
  definition_id TEXT NOT NULL,
  version TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (definition_id)
);
