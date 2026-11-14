<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun vehicle

Vehicle là 1 xe giao hàng: biển số duy nhất, loại xe là chuỗi tự do (ví
dụ "Xe máy", "Xe tải nhỏ"), trạng thái "Sẵn sàng", "Đang giao" hoặc "Bảo
trì". Chưa có sức chở, GPS, tuyến đường hay tài xế gắn với xe: tài xế
thuộc mô đun Driver làm sau.

- `create`: chỉ Điều phối viên, tạo luôn ở trạng thái "Sẵn sàng". Biển số
  hoặc loại xe rỗng thì báo 400; biển số trùng thì báo 409, không ghi
  audit vì đây là lỗi lúc tạo.
- `get`: đọc 1 xe, không có thì 404. `list`: mọi caller đã xác thực đều
  đọc được, lọc theo `?status=`.
- `maintenance`: chỉ Điều phối viên, chỉ từ "Sẵn sàng" sang "Bảo trì", từ
  trạng thái khác thì báo 409.
- `activate`: chỉ Điều phối viên, chỉ từ "Bảo trì" sang "Sẵn sàng", từ
  trạng thái khác thì báo 409.
- Không có endpoint xóa xe: xe đã từng giao hàng còn gắn với shipment cũ
  nên giữ lại làm dữ liệu lịch sử; xe không dùng nữa thì cho vào bảo trì.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak, trường
  orderId của audit mang mã xe (`vehicle.created`, `vehicle.maintenance`,
  `vehicle.activated`), theo tiền lệ các mô đun khác dùng chung trường này
  cho mã thực thể nghiệp vụ. Sai trạng thái hoặc sai vai thì báo 409,
  không ghi audit denied riêng.
- Kho xe nằm sau interface `VehicleStore`. Khi chạy thật, kho là Postgres
  (`PostgresVehicleStore`, bảng `vehicles`, lưu bền qua `src/db/`); bản bộ
  nhớ (`InMemoryVehicleStore`) chỉ dùng trong kiểm thử đơn vị. Số thứ tự
  xe (XE-1001...) tiếp tục từ số lớn nhất đã có trong kho, khởi động lại
  API không quay về XE-1001.

## Nối vào điều xe (dispatch)

Từ khi có mô đun này, `dispatch` không còn nhận vehicleId là chuỗi tự do:
vehicleId phải là id của 1 Vehicle có thật và đang ở "Sẵn sàng" (không có
thì 404, đang ở trạng thái khác thì 409 và ghi audit
`shipment.transition.denied`). Kiểm tra này đặt ở giai đoạn pre-check,
trước khi đổi shipment, nên lần điều xe không đi được thì shipment giữ
nguyên.

Trạng thái xe đi theo shipment, nhưng đổi trạng thái xe do shipment gây ra
thì KHÔNG ghi audit vehicle riêng, vì audit `shipment.dispatched`,
`shipment.delivered` và `shipment.failed` đã bao phủ sự kiện:

- Điều xe thành công: sau khi shipment đã lưu và đơn đã chuyển sang "Đang
  giao" thì xe mới sang "Đang giao".
- Giao hàng thành công hoặc giao thất bại: sau khi đơn đã chuyển xong thì
  xe về "Sẵn sàng", nên điều xe lại sau thất bại được phép đổi xe khác.
- Hủy shipment không động vào xe (hủy chỉ từ "Chờ điều xe", lúc đó chưa
  điều xe).

## Hạn chế đã biết

- Lưu shipment, lưu đơn, lưu xe và lưu tài xế là các bước nối tiếp, không
  chung 1 giao dịch (cùng loại hạn chế với commit lưu bền Postgres): sự cố
  giữa các bước có thể để shipment đi trước đơn, hoặc đơn đi trước xe hay
  tài xế. Khi đó chuyển trực tiếp đơn vẫn qua được rào chắn bằng chứng
  shipment (shipment đã ở trạng thái mới) nên Điều phối viên chuyển bù
  được; xe hay tài xế lệch thì dùng endpoint maintenance/activate của xe
  hoặc rest/activate của tài xế để đưa về đúng trạng thái, không sửa dữ
  liệu tay. Trong khoảng lệch đó, xe đang ở "Sẵn sàng" trong khi shipment
  của nó đã "Đang giao" có thể bị điều cho đơn khác; lần giao hàng hoặc
  giao thất bại sau đó vẫn trả xe về "Sẵn sàng".
- Việc gán xe cho tài xế (driver.vehicleId) là thông tin xe tài xế thường
  lái, KHÔNG ép phải bằng xe điều ở dispatch: dispatch vẫn gán tài xế và
  xe độc lập với nhau (xem README của mô-đun driver).
