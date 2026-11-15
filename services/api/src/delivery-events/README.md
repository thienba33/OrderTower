<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun delivery-event

DeliveryEvent là 1 mốc trong nhật ký giao hàng của 1 shipment
(DeliveryEvent N-1 Shipment): điều xe, lấy hàng, đang giao, giao hàng,
giao thất bại, ghi chú. Sự kiện chỉ ghi thêm, không có endpoint sửa hay
xóa; lịch sử trạng thái của shipment vẫn là nguồn chính cho trạng thái
hiện tại, nhật ký này ghi lại diễn biến giao hàng để tra cứu và đối
soát. Không có GPS, vị trí hay tuyến đường.

- `create`: Tài xế hoặc Điều phối viên, shipment phải tồn tại và đang ở
  "Đang giao". Chỉ 3 loại tạo bằng tay: "Lấy hàng", "Đang giao", "Ghi
  chú". Ba loại "Nhận đơn", "Đã giao" và "Giao thất bại" là hệ quả của
  chuyển shipment nên tạo bằng tay thì báo 400; type ngoài tập kín cũng
  báo 400. Tài xế ghi sự kiện thì phải đúng là tài xế của shipment (tài
  xế khác thì báo 409 và ghi audit `delivery-event.create.denied`);
  Điều phối viên ghi sự kiện cho shipment bất kỳ nên không kiểm tra
  quyền sở hữu, giống giao thất bại. Loại "Ghi chú" bắt buộc có note
  không rỗng, thiếu thì báo 400. note và proofPhotoKey cắt khoảng trắng
  2 đầu khi có. Ghi bằng tay thành công thì ghi audit
  `delivery-event.created`, trường orderId của audit mang mã đơn.
- `get`: đọc 1 sự kiện, không có thì 404. `list`: mọi caller đã xác
  thực đều đọc được, lọc theo `?shipmentId=`, `?orderId=` và `?type=`.
- Kiểm trạng thái trước, kiểm vai sau, giống thứ tự ở dispatch của
  shipment: shipment sai trạng thái thì báo 409 và ghi audit denied
  trước khi kiểm vai. Shipment không tồn tại thì báo 404, không ghi
  audit denied.
- Kho sự kiện nằm sau interface `DeliveryEventStore`. Khi chạy thật,
  kho là Postgres (`PostgresDeliveryEventStore`, bảng
  `delivery_events`, lưu bền qua `src/db/`); bản bộ nhớ
  (`InMemoryDeliveryEventStore`) chỉ dùng trong kiểm thử đơn vị. Số
  thứ tự sự kiện (SK-1001...) tiếp tục từ số lớn nhất đã có trong kho,
  khởi động lại API không quay về SK-1001.

## Sự kiện tự động theo chuyển shipment

Điều xe, giao hàng và giao thất bại ghi thêm 1 sự kiện tự động, sau khi
đơn đã chuyển xong và xe/tài xế đã đổi trạng thái, cùng giai đoạn với
markBusy/markAvailable:

- Điều xe thành công: sự kiện "Nhận đơn", người ghi là Điều phối viên
  điều xe.
- Giao hàng thành công: sự kiện "Đã giao", kèm proofPhotoKey của
  shipment, người ghi là tài xế giao hàng.
- Giao thất bại: sự kiện "Giao thất bại", note là lý do thất bại, người
  ghi là người báo cáo.

Sự kiện tự động KHÔNG ghi audit riêng: audit
`shipment.dispatched`, `shipment.delivered` và `shipment.failed` đã bao
phủ sự kiện, giống trạng thái xe và tài xế đổi theo shipment không ghi
audit riêng. `ShipmentsService` lấy `DeliveryEventsService` dạng tùy
chọn (`@Optional()`): khi chạy qua mô-đun thì luôn có; khi dựng service
bằng tay trong kiểm thử mà không truyền thì điều xe, giao hàng và giao
thất bại vẫn chạy bình thường, chỉ không ghi sự kiện tự động, vì sự
kiện là nhật ký chứ không phải rào chắn.

## Cách nối mô-đun (không có vòng lặp)

`DeliveryEventsService` cần đọc shipment (tồn tại, trạng thái, tài xế
được giao) và tài xế (tên đăng nhập để kiểm tra quyền sở hữu), nhưng
không được gọi `ShipmentsService` hay `DriversService`, vì
`ShipmentsService` lại cần `DeliveryEventsService` để ghi sự kiện tự
động. Cách nối đã chọn, theo tiền lệ cổng đọc qua kho
(`ORDER_SHIPMENT_GATE` / `ShipmentGateAdapter`):

- Service đọc qua store token: `SHIPMENT_STORE` để đọc shipment,
  `DRIVER_STORE` để đọc tài xế, `DELIVERY_EVENT_STORE` để lưu sự
  kiện. Mức service không gọi service khác nên không có vòng lặp
  service.
- Hai token kho shipment và kho tài xế KHÔNG được export khỏi
  `ShipmentsModule` và `DriversModule`, nên `DeliveryEventsModule`
  đăng ký lại 2 provider này bằng cùng lớp Postgres của mô-đun gốc
  (`PostgresShipmentStore`, `PostgresDriverStore`), mỗi provider chỉ
  là 1 factory một dòng quanh `DbService` dùng chung và không giữ trạng
  thái. Nhờ vậy `DeliveryEventsModule` chỉ nhập `AuditModule` và
  `DbModule`; `ShipmentsModule` nhập `DeliveryEventsModule` bằng
  import thường để lấy service ghi sự kiện tự động. Đồ thị mô-đun là
  DAG, không cần `forwardRef` ở đâu.
- Đánh đổi đã biết: token `SHIPMENT_STORE` và `DRIVER_STORE` được đăng
  ký ở 2 mô-đun (mô-đun gốc và mô-đun này), mỗi nơi 1 factory một
  dòng trỏ cùng lớp kho. Hai bản là cùng lớp, cùng `DbService` dùng
  chung nên hành vi không lệch nhau; nếu lớp kho đổi thì sửa cùng 1
  dòng ở cả 2 nơi.

## Hạn chế đã biết

- Lưu sự kiện, lưu shipment, lưu đơn, lưu xe và lưu tài xế là các bước
  nối tiếp, không chung 1 giao dịch (cùng loại hạn chế với commit lưu
  bền Postgres): sự cố giữa các bước có thể để sự kiện chưa kịp ghi
  trong khi shipment đã đi trước, hoặc shipment đi trước đơn. Khi đó
  đọc lại lịch sử của shipment (trường `history` của shipment) vẫn
  thấy đủ các mốc chuyển trạng thái: lịch sử shipment là nguồn chính
  cho trạng thái, nhật ký sự kiện chỉ là bản ghi thêm để tra cứu, nên
  thiếu 1 sự kiện tự động không chặn được luồng giao hàng và không làm
  sai trạng thái đơn.
- Chưa kiểm chứng với Postgres thật và chưa gọi endpoint qua HTTP thật
  (chỉ chạy trên pg-mem trong kiểm thử); migration 005 chạy được trên
  pg-mem, gồm cả ràng buộc khóa chính ở cuối bảng và các index.
