<!-- SPDX-License-Identifier: Apache-2.0 -->
# Dữ liệu mẫu

Nguyên tắc: dữ liệu tự tạo, đã ẩn danh, không lấy từ hệ thống thật nào.
Dữ liệu mẫu được đóng băng thành một bản duy nhất, dashboard, lớp BI và
DX-Score đều đọc từ bản đóng băng này.

Gồm: 1 kho, khoảng 40 sản phẩm, khoảng 120 đơn hàng ở các trạng thái khác
nhau, 5 xe và tài xế mô phỏng, bảng địa danh hành chính mẫu, lịch sử giao
hàng mẫu, 3 kênh nguồn đơn mô phỏng (website, sàn, chat), lịch sử bán theo
thời gian, đơn hoàn kèm kênh và lý do.

## Seed tự nạp khi API khởi động

API tự nạp dữ liệu mẫu khi bảng còn trống, khởi động lại không nạp lại:

- Kho (11 SKU): `services/api/src/inventory/data/inventory.seed.json`
  (biến môi trường `INVENTORY_SEED_PATH`).
- Kênh (Chat, Web, Điện thoại):
  `services/api/src/channels/data/channels.seed.json`
  (biến môi trường `CHANNELS_SEED_PATH`).
- Xe (5 xe): `services/api/src/vehicles/data/vehicles.seed.json`
  (biến môi trường `VEHICLES_SEED_PATH`).
- Tài xế (5 tài xế, trong đó `demo.driver` khớp tài khoản demo
  Keycloak): `services/api/src/drivers/data/drivers.seed.json`
  (biến môi trường `DRIVERS_SEED_PATH`).
- Đơn mẫu (8 đơn: Mới tạo x2, Đã kiểm tra x2, Chờ kho x2, Đang đóng
  gói x1, Chờ điều xe x1; 1 đơn tin cậy thấp 50, còn lại 100):
  `services/api/src/orders/data/orders.seed.json`
  (biến môi trường `ORDERS_SEED_PATH`).

Đổi seed bằng cách đặt biến môi trường trên trỏ tới tệp JSON khác cùng
hình dạng, rồi khởi động API với cơ sở dữ liệu trống. Đơn mẫu được tạo
qua đường dịch vụ thật nên đi qua workflow instance, audit và giữ chỗ
tồn kho; người thực hiện ghi trong audit là hệ thống seed.

`sample-orders.json` chứa 2 đơn minh họa cũ, không dùng được (mã
DH-0001, kênh website/san, SKU SP-001/SP-002, không khớp hệ thật),
không có lệnh nào nạp nó.
