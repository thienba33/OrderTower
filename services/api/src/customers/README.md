<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun customer

Customer là 1 khách hàng nhận đơn: tên, số điện thoại duy nhất, địa chỉ
giao hàng tự do tùy chọn. Không có trạng thái, không có cờ hạn chế. Số
điện thoại không kiểm tra định dạng, chỉ cần chuỗi không rỗng, giống
SĐT tài xế. Tên và SĐT được cắt khoảng trắng 2 đầu trước khi lưu, để
" 0901 " và "0901" không thành 2 số khác nhau.

- `create`: chỉ Điều phối viên. Tên rỗng thì báo 400, SĐT rỗng thì báo
  400; SĐT trùng thì báo 409, không ghi audit vì đây là lỗi lúc tạo,
  giống tên kênh trùng. Không có dữ liệu mẫu nạp sẵn: khách hàng tạo
  qua API, không có sổ khách đóng băng ở frontend để khớp.
- `get`: đọc 1 khách hàng, không có thì 404. `findById` và `findByPhone`:
  tìm khách không ném lỗi, để đơn kiểm tra khách có thật. `list`: mọi
  caller đã xác thực đều đọc được, lọc theo `?phone=` (khớp chính xác).
- Không có endpoint sửa hay xóa khách hàng: khách đã từng có đơn còn
  gắn với đơn cũ nên giữ lại làm dữ liệu lịch sử, giống kênh bán, xe và
  tài xế.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak, trường
  orderId của audit mang mã khách hàng (`customer.created`), theo tiền lệ
  các mô đun khác dùng chung trường này cho mã thực thể nghiệp vụ.
  Khách hàng không có trạng thái nên bản ghi `customer.created` có cả
  `from` và `to` đều null.
- Kho khách hàng nằm sau interface `CustomerStore`. Khi chạy thật, kho là
  Postgres (`PostgresCustomerStore`, bảng `customers`, lưu bền qua
  `src/db/`); bản bộ nhớ (`InMemoryCustomerStore`) chỉ dùng trong kiểm
  thử đơn vị. Số thứ tự khách hàng (KH-1001...) tiếp tục từ số lớn nhất
  đã có trong kho, khởi động lại API không quay về KH-1001.

## Nối vào đơn hàng

Từ khi có mô đun này, đơn có thêm `customerId` (nullable, không bắt buộc):

- Tạo đơn kèm `customerId`: khách phải có thật (không có thì 404, không
  ghi audit). Không kèm `customerId` thì đơn vẫn tạo bình thường.
- Sửa đơn (PATCH) được đổi `customerId` ở đơn mở với cùng kiểm tra; đơn
  đã đóng vẫn đi qua phê duyệt như các trường khác. Gửi
  `customerId: null` thì gỡ khách khỏi đơn.
- GET /api/orders lọc được theo `?customerId=`.
- Trường `customer` (chuỗi tên khách) trên đơn giữ nguyên, không đổi:
  `customerId` là liên kết tới hồ sơ khách hàng, còn `customer` là tên
  ghi lúc tạo đơn.

## Hạn chế đã biết

- Lưu khách hàng và lưu đơn là các bước nối tiếp, không chung 1 giao
  dịch (cùng loại hạn chế với commit lưu bền Postgres): sự cố giữa các
  bước có thể để đơn đã lưu mà khách chưa kịp tạo, nhưng tạo đơn kèm
  khách thì khách đã có trước nên không lệch theo đơn.
- Chưa có endpoint sửa hay xóa khách hàng; muốn đổi SĐT hay địa chỉ của
  khách thì tạo khách mới.
- Chưa nối với danh sách hạn chế: khách trong danh sách hạn chế vẫn tạo
  đơn bình thường, việc chặn đơn của khách bị hạn chế là quyết định tiếp
  theo, chưa làm trong mô đun này.
- Chưa kiểm chứng với Postgres thật và chưa gọi qua HTTP thật, chỉ mới
  trên pg-mem.
