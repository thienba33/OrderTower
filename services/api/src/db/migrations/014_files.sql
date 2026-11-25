-- SPDX-License-Identifier: Apache-2.0
-- Migration 014: dịch vụ dữ liệu phi cấu trúc.
-- files: metadata của object lưu ở SeaweedFS S3; không lưu nội dung file.
-- shipments.proof_photo_file_id: trỏ tới file bằng chứng đã upload thay vì
-- chỉ lưu chuỗi khóa như trước; proof_photo_key vẫn giữ để tương thích.
-- Khóa chính viết ở cuối bảng để chạy được trên cả Postgres thật và pg-mem.

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS proof_photo_file_id TEXT;

CREATE TABLE IF NOT EXISTS files (
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_username TEXT NOT NULL,
  order_id TEXT,
  kind TEXT NOT NULL,
  title TEXT,
  category TEXT,
  object_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  scan_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanned_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  delete_reason TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_files_order_id ON files (order_id);
CREATE INDEX IF NOT EXISTS idx_files_kind ON files (kind);
CREATE INDEX IF NOT EXISTS idx_files_status ON files (status);
CREATE INDEX IF NOT EXISTS idx_files_owner_username ON files (owner_username);
