-- SPDX-License-Identifier: Apache-2.0
-- Migration 012: bảng lưu bền cho lớp BI pilot (mục 3 bản dự thảo).
-- bi_recommendations: đề xuất hành động sinh ra từ bất thường (thực thể
-- AIRecommendation trong plan mục 5); anomaly_key UNIQUE để 1 bất thường
-- chỉ có 1 đề xuất đang chờ duyệt, gọi GET /api/bi/anomalies nhiều lần
-- không tạo đề xuất trùng.
-- bi_feedback: phản hồi đối chiếu kết quả thật của đề xuất đã duyệt (thực
-- thể AIFeedback trong plan mục 5); UNIQUE trên recommendation_id, mỗi đề
-- xuất tối đa 1 phản hồi.
-- dx_score_snapshots: 1 snapshot DX-Score cho mỗi lần tính (append-only,
-- theo plan mục 5); điểm thành phần lưu số (NUMERIC) để truy vấn, toàn bộ
-- payload JSONB để bấm xuống được log gốc qua các tỷ lệ thành phần.
-- Khóa chính viết ở cuối bảng (PRIMARY KEY (...)) thay vì viết ngay sau
-- cột, để câu lệnh chạy được cả trên Postgres thật và trên pg-mem dùng
-- kiểm thử (xem chú thích trong src/db/migrations/002_shipments.sql).
-- order_id và recommendation_id KHÔNG có khóa ngoại: tham chiếu được kiểm
-- tra ở service, không dựa vào ràng buộc DB, để các mô-đun nối lỏng với
-- nhau và không phụ thuộc thứ tự migration (giống 011_restricted_flags).

CREATE TABLE IF NOT EXISTS bi_recommendations (
  id TEXT NOT NULL,
  anomaly_key TEXT NOT NULL,
  type TEXT NOT NULL,
  sku TEXT,
  channel_id TEXT,
  title TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  inputs JSONB NOT NULL,
  status TEXT NOT NULL,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (anomaly_key)
);
CREATE INDEX IF NOT EXISTS idx_bi_recommendations_status ON bi_recommendations (status);
CREATE INDEX IF NOT EXISTS idx_bi_recommendations_type ON bi_recommendations (type);

CREATE TABLE IF NOT EXISTS bi_feedback (
  id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  note TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (recommendation_id)
);
CREATE INDEX IF NOT EXISTS idx_bi_feedback_recommendation_id ON bi_feedback (recommendation_id);

CREATE TABLE IF NOT EXISTS dx_score_snapshots (
  id TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  reference_date DATE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  p_score NUMERIC NOT NULL,
  d_score NUMERIC NOT NULL,
  i_score NUMERIC NOT NULL,
  h_score NUMERIC NOT NULL,
  total_score NUMERIC NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_dx_score_snapshots_computed_at ON dx_score_snapshots (computed_at);
