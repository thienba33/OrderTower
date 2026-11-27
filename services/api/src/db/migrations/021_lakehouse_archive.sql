-- SPDX-License-Identifier: Apache-2.0
-- Migration 021: lakehouse-lite cho don da dong.
-- archive_runs la manifest cua tung lan export Parquet; order_archive_manifest
-- danh dau don da duoc archive de khong export trung. Don goc van nam trong
-- OLTP de khong pha vo workflow/audit; phan tich lich su doc tu Parquet.

CREATE TABLE IF NOT EXISTS archive_runs (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  dataset TEXT NOT NULL,
  cutoff_at TIMESTAMPTZ NOT NULL,
  object_key TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_archive_runs_tenant_started
  ON archive_runs (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS order_archive_manifest (
  order_id TEXT NOT NULL,
  archive_key TEXT NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  PRIMARY KEY (order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_archive_manifest_key
  ON order_archive_manifest (archive_key);
CREATE INDEX IF NOT EXISTS idx_order_archive_manifest_tenant
  ON order_archive_manifest (tenant_id);
