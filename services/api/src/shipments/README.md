<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun shipment

Shipment là 1 lượt giao 1 đơn: tạo khi đơn ở "Chờ điều xe", điều xe cho
tài xế, giao hàng kèm bằng chứng, hoặc ghi giao thất bại để điều xe lại,
hoặc hủy khi chưa điều xe.

- `create`: chỉ Điều phối viên, đơn phải tồn tại và đang ở "Chờ điều xe",
  mỗi đơn chỉ có tối đa 1 shipment đang hoạt động (trạng thái "Chờ điều
  xe", "Đang giao" hoặc "Giao thất bại").
- `dispatch`: chỉ Điều phối viên, từ "Chờ điều xe" hoặc "Giao thất bại"
  sang "Đang giao", bắt buộc có driverId và vehicleId. driverId phải là
  id của 1 Driver có thật đang ở "Sẵn sàng" và vehicleId phải là id của
  1 Vehicle có thật đang ở "Sẵn sàng": không có thì báo 404, đang ở trạng
  thái khác thì báo 409 và ghi audit `shipment.transition.denied`. Kiểm
  tra xe và tài xế đặt ở giai đoạn pre-check, trước khi đổi shipment. Điều
  xe xong, đơn cũng chuyển từ "Chờ điều xe" sang "Đang giao" (rào chắn
  "đã điều xe" có thật từ đây), rồi xe và tài xế mới sang "Đang giao".
- `deliver`: chỉ Tài xế, từ "Đang giao" sang "Đã giao", bắt buộc có
  proofPhotoKey là khóa tệp bằng chứng trong kho đối tượng. Tài xế của
  shipment phải đúng là người gọi (tài xế khác thì báo 409 và ghi audit
  `shipment.transition.denied`). Giao hàng xong, đơn cũng chuyển từ "Đang
  giao" sang "Đã giao" (rào chắn "có ảnh bằng chứng" có thật từ đây), rồi
  xe và tài xế về "Sẵn sàng".
- `fail`: Tài xế hoặc Điều phối viên, từ "Đang giao" sang "Giao thất bại",
  bắt buộc có lý do. Tài xế báo thất bại thì phải đúng là tài xế của
  shipment (tài xế khác thì báo 409 và ghi audit
  `shipment.transition.denied`); Điều phối viên báo thất bại cho shipment
  bất kỳ nên không kiểm tra quyền sở hữu. Đơn quay lại "Chờ điều xe" theo
  cùng lý do, rồi xe và tài xế về "Sẵn sàng" nên điều xe lại được phép đổi
  xe khác và đổi tài xế khác. Việc
  chuyển đơn là hệ quả của báo cáo thất bại, không phải quyết định của
  Điều phối viên, nên người báo cáo (kể cả Tài xế) kéo theo chuyển đơn và
  ghi audit với người báo cáo làm actor; vai ghi trong lịch sử và audit
  vẫn là vai theo định nghĩa ("Điều phối viên"), theo quy ước chung của
  luồng. Shipment giao thất bại vẫn đang hoạt động nên điều xe lại được mà
  không cần tạo shipment mới.
- `cancel`: chỉ Điều phối viên, từ "Chờ điều xe" sang "Đã hủy", bắt buộc
  có lý do. Hủy rồi tạo lại shipment mới được (đơn vẫn ở "Chờ điều xe").
  Hủy không động vào xe hay tài xế (lúc đó chưa điều xe).
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

- Lưu shipment, lưu đơn, lưu xe và lưu tài xế là các bước nối tiếp,
  không chung 1 giao dịch (cùng loại hạn chế với commit lưu bền Postgres):
  sự cố giữa các bước có thể để shipment đi trước đơn, hoặc đơn đi trước
  xe hay tài xế. Khi đó chuyển trực tiếp đơn vẫn qua được rào chắn bằng
  chứng shipment (shipment đã ở trạng thái mới) nên Điều phối viên chuyển
  bù được; xe hay tài xế lệch thì dùng endpoint maintenance/activate của
  xe hoặc rest/activate của tài xế để đưa về đúng trạng thái, không sửa dữ
  liệu tay. Trong khoảng lệch đó, xe hay tài xế đang ở "Sẵn sàng" trong
  khi shipment của mình đã "Đang giao" có thể bị điều cho đơn khác; lần
  giao hàng hoặc giao thất bại sau đó vẫn trả xe và tài xế về "Sẵn sàng".
- Việc gán xe cho tài xế (driver.vehicleId) là thông tin xe tài xế thường
  lái, KHÔNG ép phải bằng xe điều ở dispatch: dispatch vẫn gán tài xế và
  xe độc lập với nhau.
- Trạng thái xe và tài xế đổi do shipment kéo theo không ghi audit
  vehicle hay driver riêng: audit `shipment.dispatched`,
  `shipment.delivered` và `shipment.failed` đã bao phủ sự kiện (xem README
  của mô-đun vehicle và driver).
