<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun shipment

Shipment là 1 lượt giao 1 đơn: tạo khi đơn ở "Chờ điều xe", điều xe cho
tài xế, giao hàng kèm bằng chứng, hoặc ghi giao thất bại để điều xe lại,
hoặc hủy khi chưa điều xe.

- `create`: chỉ Điều phối viên, đơn phải tồn tại và đang ở "Chờ điều xe",
  mỗi đơn chỉ có tối đa 1 shipment đang hoạt động (trạng thái "Chờ điều
  xe", "Đang giao" hoặc "Giao thất bại").
- `dispatch`: chỉ Điều phối viên, từ "Chờ điều xe" hoặc "Giao thất bại"
  sang "Đang giao", bắt buộc có driverId và vehicleId.
- `deliver`: chỉ Tài xế, từ "Đang giao" sang "Đã giao", bắt buộc có
  proofPhotoKey là khóa tệp bằng chứng trong kho đối tượng.
- `fail`: Tài xế hoặc Điều phối viên, từ "Đang giao" sang "Giao thất bại",
  bắt buộc có lý do. Shipment giao thất bại vẫn đang hoạt động nên điều xe
  lại được mà không cần tạo shipment mới.
- `cancel`: chỉ Điều phối viên, từ "Chờ điều xe" sang "Đã hủy", bắt buộc
  có lý do. Hủy rồi tạo lại shipment mới được (đơn vẫn ở "Chờ điều xe").
- Chuyển trái phép (sai trạng thái hoặc sai vai) trả 409 và ghi audit
  `shipment.transition.denied`; thiếu dữ liệu bắt buộc trả 400. Mọi sự
  kiện đều ghi audit với người thật lấy từ token Keycloak, trường orderId
  của audit mang mã đơn như các mô đun khác.
- Kho shipment nằm sau interface `ShipmentStore`. Khi chạy thật, kho là
  Postgres (`PostgresShipmentStore`, bảng `shipments` và
  `shipment_history`, lưu bền qua `src/db/`); bản bộ nhớ
  (`InMemoryShipmentStore`) chỉ dùng trong kiểm thử đơn vị. Số thứ tự
  shipment (GH-1001...) tiếp tục từ số lớn nhất đã có trong kho, khởi động
  lại API không quay về GH-1001.

## Hạn chế đã biết

- Chưa kiểm tra quyền sở hữu theo tài xế: tài xế nào có vai Tài xế cũng
  giao hàng hoặc đánh dấu giao thất bại được, không phân biệt shipment đó
  có giao cho mình hay không. Kiểm tra này làm cùng mô đun Driver sau.
- Chưa nối vào chuyển trạng thái đơn: tạo, điều xe và giao hàng chưa đổi
  trạng thái đơn, rào chắn "đã điều xe" ở chuyển "Chờ điều xe" sang
  "Đang giao" của đơn thêm ở commit sau. Vì vậy trong commit này, sau khi
  1 shipment đã giao, đơn vẫn ở "Chờ điều xe" và tạo được shipment mới;
  commit nối sẽ chặn bằng cách chuyển trạng thái đơn theo shipment.
