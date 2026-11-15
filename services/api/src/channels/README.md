<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun channel

Channel là 1 kênh nguồn đơn: nơi đơn hàng đi vào hệ thống. 3 kênh mẫu
đóng băng theo dữ liệu mẫu (Chat, Web, Điện thoại) được nạp từ tệp seed
lúc khởi động khi kho còn trống; kênh tạo tay tiếp theo nối số thứ tự.
Tên kênh duy nhất, so sánh chính xác cả hoa thường, giống biển số xe và
tên đăng nhập tài xế. Kênh là chiều dữ liệu của lớp BI: dự báo nhu cầu và
tỷ lệ hoàn tính theo từng kênh.

- `create`: chỉ Điều phối viên, tạo luôn ở trạng thái "Hoạt động". Tên
  rỗng thì báo 400; tên trùng thì báo 409, không ghi audit vì đây là lỗi
  lúc tạo.
- `get`: đọc 1 kênh, không có thì 404. `findById`: tìm kênh không ném
  lỗi, để đơn kiểm tra kênh có thật và đang hoạt động thì chặn 409
  fail-closed thay vì 404. `list`: mọi caller đã xác thực đều đọc được,
  lọc theo `?status=`.
- `pause`: chỉ Điều phối viên, chỉ từ "Hoạt động" sang "Tạm dừng", từ
  trạng thái khác thì báo 409.
- `activate`: chỉ Điều phối viên, chỉ từ "Tạm dừng" sang "Hoạt động", từ
  trạng thái khác thì báo 409.
- Không có endpoint xóa kênh: kênh đã từng có đơn còn gắn với đơn cũ nên
  giữ lại làm dữ liệu lịch sử; kênh không dùng nữa thì tạm dừng.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak, trường
  orderId của audit mang mã kênh (`channel.created`, `channel.paused`,
  `channel.activated`), theo tiền lệ các mô đun khác dùng chung trường này
  cho mã thực thể nghiệp vụ. Sai trạng thái hoặc sai vai thì báo 409,
  không ghi audit denied riêng.
- Nạp seed không ghi audit: 3 kênh mẫu là dữ liệu đóng băng, không phải
  hành động của người dùng.
- Kho kênh nằm sau interface `ChannelStore`. Khi chạy thật, kho là
  Postgres (`PostgresChannelStore`, bảng `channels`, lưu bền qua
  `src/db/`); bản bộ nhớ (`InMemoryChannelStore`) chỉ dùng trong kiểm thử
  đơn vị. Số thứ tự kênh (K-1001...) tiếp tục từ số lớn nhất đã có trong
  kho, khởi động lại API không quay về K-1001.

## Nối vào đơn hàng

Từ khi có mô đun này, đơn có thêm `channelId` (nullable, không bắt buộc):

- Tạo đơn kèm `channelId`: kênh phải có thật (không có thì 404) và đang
  "Hoạt động" (tạm dừng thì 409, không ghi audit). Không kèm `channelId`
  thì đơn vẫn tạo bình thường.
- Sửa đơn (PATCH) được đổi `channelId` ở đơn mở với cùng kiểm tra; đơn đã
  đóng vẫn đi qua phê duyệt như các trường khác. Gửi `channelId: null`
  thì gỡ kênh khỏi đơn.
- GET /api/orders lọc được theo `?channelId=`.

## Hạn chế đã biết

- Lưu kênh và lưu đơn là các bước nối tiếp, không chung 1 giao dịch (cùng
  loại hạn chế với commit lưu bền Postgres): sự cố giữa các bước có thể
  để đơn đã lưu mà kênh chưa kịp đổi trạng thái, nhưng kênh chỉ đổi trạng
  thái qua endpoint riêng nên không lệch theo đơn.
- 3 kênh mẫu (Chat, Web, Điện thoại) khớp dữ liệu mẫu đóng băng
  02/11/2026 trong apps/web/data/orders.ts (ORDER_CHANNELS).
- Chưa kiểm chứng với Postgres thật và chưa gọi qua HTTP thật, chỉ mới
  trên pg-mem.
