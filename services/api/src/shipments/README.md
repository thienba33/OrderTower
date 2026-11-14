<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun shipment

Shipment là 1 lượt giao 1 đơn: tạo khi đơn ở "Chờ điều xe", điều xe cho
tài xế, giao hàng kèm bằng chứng, hoặc ghi giao thất bại để điều xe lại,
hoặc hủy khi chưa điều xe.

- `create`: chỉ Điều phối viên, đơn phải tồn tại và đang ở "Chờ điều xe",
  mỗi đơn chỉ có tối đa 1 shipment đang hoạt động (trạng thái "Chờ điều
  xe", "Đang giao" hoặc "Giao thất bại").
- `dispatch`: chỉ Điều phối viên, từ "Chờ điều xe" hoặc "Giao thất bại"
  sang "Đang giao", bắt buộc có driverId và vehicleId. Điều xe xong, đơn
  cũng chuyển từ "Chờ điều xe" sang "Đang giao" (rào chắn "đã điều xe" có
  thật từ đây).
- `deliver`: chỉ Tài xế, từ "Đang giao" sang "Đã giao", bắt buộc có
  proofPhotoKey là khóa tệp bằng chứng trong kho đối tượng. Giao hàng
  xong, đơn cũng chuyển từ "Đang giao" sang "Đã giao" (rào chắn "có ảnh
  bằng chứng" có thật từ đây).
- `fail`: Tài xế hoặc Điều phối viên, từ "Đang giao" sang "Giao thất bại",
  bắt buộc có lý do. Đơn quay lại "Chờ điều xe" theo cùng lý do. Việc
  chuyển đơn là hệ quả của báo cáo thất bại, không phải quyết định của
  Điều phối viên, nên người báo cáo (kể cả Tài xế) kéo theo chuyển đơn và
  ghi audit với người báo cáo làm actor; vai ghi trong lịch sử và audit
  vẫn là vai theo định nghĩa ("Điều phối viên"), theo quy ước chung của
  luồng. Shipment giao thất bại vẫn đang hoạt động nên điều xe lại được mà
  không cần tạo shipment mới.
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

## Nối vào chuyển trạng thái đơn

Mỗi sự kiện shipment kéo theo chuyển trạng thái đơn qua đúng đường chuyển
của đơn (Workflow engine + audit), không ghi đè trạng thái đơn trực tiếp:

- Trước khi đổi shipment, service kiểm tra trước chuyển đơn (trạng thái
  đơn hiện tại + chuyển có trong định nghĩa + vai người gọi, trừ giao thất
  bại chỉ kiểm chuyển có tồn tại vì Tài xế báo cáo không có vai Điều phối
  viên theo định nghĩa). Chuyển đơn không theo được thì shipment không đổi.
- Sau khi lưu shipment, service gọi `OrdersService.transitionForShipment`
  để chuyển đơn. Rào chắn bằng chứng shipment ("đã điều xe", "có ảnh bằng
  chứng") đọc trạng thái shipment vừa lưu, nên chuyển trực tiếp đơn
  (`POST /api/orders/:id/transitions`) sang "Đang giao" cũng bị chặn 409
  khi chưa có shipment đang giao, và sang "Đã giao" cũng bị chặn khi chưa
  có shipment đã giao kèm ảnh bằng chứng.
- Vì vậy sau khi 1 shipment đã giao, đơn ở "Đã giao" và không tạo được
  shipment mới cho đơn đó nữa; sau khi giao thất bại, đơn quay lại "Chờ
  điều xe" và điều xe lại chính shipment đó.

Tránh vòng lặp mô-đun: phía đơn chỉ đọc shipment qua cổng
`ORDER_SHIPMENT_GATE` (định nghĩa ở phía đơn, `ShipmentGateAdapter` ở
phía shipment đọc qua `ShipmentStore`, không qua `ShipmentsService`), còn
`ShipmentsService` lấy `OrdersService` qua `forwardRef`. Vòng lặp chỉ ở
mức mô-đun, mức service không lặp. `OrdersService` tiêm cổng tùy chọn:
khi cổng không có (dựng service bằng tay trong kiểm thử, không qua
mô-đun), 2 chuyển có rào chắn bằng chứng shipment đều bị chặn.

## Hạn chế đã biết

- Chưa kiểm tra quyền sở hữu theo tài xế: tài xế nào có vai Tài xế cũng
  giao hàng hoặc đánh dấu giao thất bại được, không phân biệt shipment đó
  có giao cho mình hay không. Kiểm tra này làm cùng mô đun Driver sau.
- Lưu shipment và lưu đơn là 2 bước nối tiếp, không chung 1 giao dịch
  (cùng loại hạn chế với commit lưu bền Postgres): sự cố giữa 2 bước có
  thể để shipment đi trước đơn. Khi đó chuyển trực tiếp đơn vẫn qua được
  rào chắn bằng chứng shipment (shipment đã ở trạng thái mới) nên Điều
  phối viên chuyển bù được, không cần sửa dữ liệu tay.
