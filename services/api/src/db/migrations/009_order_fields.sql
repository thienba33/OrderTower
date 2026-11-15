-- SPDX-License-Identifier: Apache-2.0
-- Migration 009: thêm SĐT liên hệ (phone), mốc giao hẹn (deadline) và
-- tổng tiền do server tính (total) cho bảng orders, cộng đơn giá bán
-- (unit_price) cho bảng inventory.
-- total KHÔNG có trong input nào của client: server tính lúc tạo đơn và
-- lúc sửa mặt hàng, bằng tổng (unitPrice ?? 0) * quantity. total để
-- NOT NULL DEFAULT 0 nên đơn tạo trước migration này về 0.
-- Giá backfill lấy từ bảng giá mẫu đóng băng ở apps/web/data/orders.ts
-- (ORDER_PRODUCTS, nguồn duy nhất): NM-25 93000, NM-40 142000, NM-15
-- 64000, HS-KHO 105000 (VND). 7 SKU còn lại (MT-08, CK-03, NM-30,
-- NM-45, MT-12, HS-MUC, CK-07) chưa biết giá ở đâu nên để NULL; đơn có
-- SKU này đóng góp 0 vào tổng tiền. Backfill bằng UPDATE để DB đã có
-- dữ liệu (seed chỉ chạy khi bảng inventory còn trống) cũng có giá.

ALTER TABLE orders ADD COLUMN phone TEXT;
ALTER TABLE orders ADD COLUMN deadline TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN unit_price INTEGER;
UPDATE inventory SET unit_price = 93000 WHERE sku = 'NM-25';
UPDATE inventory SET unit_price = 142000 WHERE sku = 'NM-40';
UPDATE inventory SET unit_price = 64000 WHERE sku = 'NM-15';
UPDATE inventory SET unit_price = 105000 WHERE sku = 'HS-KHO';
