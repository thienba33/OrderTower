-- SPDX-License-Identifier: Apache-2.0
-- Migration 020: thêm cột source cho address_proposals, ghi đề xuất đến
-- từ luật (rules) hay từ LLM (llm, Workers AI phân tích rồi luật kiểm
-- lại phường với danh mục). Hàng tạo trước migration này mặc định
-- 'rules' vì trước đây chỉ có luật.
ALTER TABLE address_proposals
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL
  DEFAULT 'rules';
