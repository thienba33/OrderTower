<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun driver

Driver là 1 tài xế giao hàng: tên, số điện thoại và tên đăng nhập Keycloak
đều bắt buộc, username và phone đều duy nhất; xe thường lái (vehicleId)
có thể null; trạng thái "Sẵn sàng", "Đang giao" hoặc "Tạm nghỉ". Chưa có
GPS, tuyến đường hay bằng lái.

- `create`: chỉ Điều phối viên, tạo luôn ở trạng thái "Sẵn sàng", chưa gán
  xe. Tên, phone hoặc username rỗng thì báo 400; trùng username hoặc trùng
  phone thì báo 409, không ghi audit vì đây là lỗi lúc tạo. Phone chỉ
  kiểm khác rỗng, không kiểm định dạng.
- `get`: đọc 1 tài xế, không có thì 404. `list`: mọi caller đã xác thực
  đều đọc được, lọc theo `?status=`.
- `assign-vehicle`: chỉ Điều phối viên, xe phải có thật (không có thì
  404) và chưa gán cho tài xế khác (đã gán thì 409); gán lại cho xe khác
  được phép. Ghi audit `driver.vehicle.assigned`.
- `unassign-vehicle`: chỉ Điều phối viên, tài xế chưa gán xe thì báo 409.
  Ghi audit `driver.vehicle.unassigned`.
- `rest`: chỉ Điều phối viên, chỉ từ "Sẵn sàng" sang "Tạm nghỉ", từ trạng
  thái khác thì báo 409.
- `activate`: chỉ Điều phối viên, chỉ từ "Tạm nghỉ" sang "Sẵn sàng", từ
  trạng thái khác thì báo 409.
- Không có endpoint xóa tài xế: tài xế đã từng giao hàng còn gắn với
  shipment cũ nên giữ lại làm dữ liệu lịch sử; tài xế không làm nữa thì
  cho tạm nghỉ.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak, trường
  orderId của audit mang mã tài xế (`driver.created`, `driver.rest`,
  `driver.activated`, `driver.vehicle.assigned`,
  `driver.vehicle.unassigned`), theo tiền lệ các mô đun khác dùng chung
  trường này cho mã thực thể nghiệp vụ. Sai trạng thái hoặc sai vai thì
  báo 409, không ghi audit denied riêng.
- Kho tài xế nằm sau interface `DriverStore`. Khi chạy thật, kho là
  Postgres (`PostgresDriverStore`, bảng `drivers`, lưu bền qua `src/db/`);
  bản bộ nhớ (`InMemoryDriverStore`) chỉ dùng trong kiểm thử đơn vị. Số
  thứ tự tài xế (TX-1001...) tiếp tục từ số lớn nhất đã có trong kho, khởi
  động lại API không quay về TX-1001.

## Nối vào điều xe, giao hàng và giao thất bại

Từ khi có mô đun này, `dispatch` không còn nhận driverId là chuỗi tự do:
driverId phải là id của 1 Driver có thật và đang ở "Sẵn sàng" (không có
thì 404, đang ở trạng thái khác thì 409 và ghi audit
`shipment.transition.denied`). Kiểm tra này đặt ở giai đoạn pre-check,
cùng chỗ với kiểm tra xe, trước khi đổi shipment, nên lần điều xe không
đi được thì shipment giữ nguyên.

Giao hàng và giao thất bại có thêm kiểm tra quyền sở hữu: tài xế của
shipment phải đúng là người gọi (so `driver.username` với
`caller.username`). Tài xế của shipment không có trong kho, hoặc shipment
chưa giao cho ai, hoặc người gọi không phải tài xế của shipment thì đều
báo 409 và ghi audit `shipment.transition.denied` (fail-closed). Điều
phối viên báo giao thất bại thì không kiểm tra quyền sở hữu (điều phối
viên được báo thất bại cho shipment bất kỳ); giao hàng vẫn chỉ Tài xế.

Trạng thái tài xế đi theo shipment, nhưng đổi trạng thái tài xế do
shipment gây ra thì KHÔNG ghi audit driver riêng, vì audit
`shipment.dispatched`, `shipment.delivered` và `shipment.failed` đã bao
phủ sự kiện:

- Điều xe thành công: sau khi shipment đã lưu và đơn đã chuyển sang "Đang
  giao" thì tài xế mới sang "Đang giao".
- Giao hàng thành công hoặc giao thất bại: sau khi đơn đã chuyển xong thì
  tài xế về "Sẵn sàng", nên điều xe lại sau thất bại được phép đổi tài xế
  khác.
- Hủy shipment không động vào tài xế (hủy chỉ từ "Chờ điều xe", lúc đó
  chưa điều xe).

Việc gán xe cho tài xế (driver.vehicleId) là thông tin xe tài xế thường
lái, KHÔNG ép phải bằng xe điều ở dispatch: dispatch vẫn gán tài xế và xe
độc lập với nhau.

## Hạn chế đã biết

- Lưu shipment, lưu đơn, lưu xe và lưu tài xế là các bước nối tiếp, không
  chung 1 giao dịch (cùng loại hạn chế với commit lưu bền Postgres): sự cố
  giữa các bước có thể để shipment đi trước đơn, hoặc đơn đi trước xe hay
  tài xế. Khi đó chuyển trực tiếp đơn vẫn qua được rào chắn bằng chứng
  shipment (shipment đã ở trạng thái mới) nên Điều phối viên chuyển bù
  được; xe hay tài xế lệch thì dùng endpoint maintenance/activate hoặc
  rest/activate để đưa về đúng trạng thái, không sửa dữ liệu tay. Trong
  khoảng lệch đó, tài xế đang ở "Sẵn sàng" trong khi shipment của mình đã
  "Đang giao" có thể bị điều cho đơn khác; lần giao hàng hoặc giao thất
  bại sau đó vẫn trả tài xế về "Sẵn sàng".
