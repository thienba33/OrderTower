<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun return

Return là 1 yêu cầu trả hàng cho đơn đã giao. Khách muốn trả hàng thì
CSKH ghi nhận; quản lý hoặc quản trị viên duyệt hay từ chối; điều phối
viên hoàn tiền sau khi duyệt. Không có chi tiết từng mặt hàng: trả là trả
cả đơn. Không có endpoint xóa: trả hàng đã tạo còn lại làm dữ liệu lịch
sử, dù đã từ chối hay đã hoàn tiền.

- `create`: chỉ Nhân viên chăm sóc khách hàng. Đơn phải có thật (không
  có thì 404, không ghi audit) và đang ở trạng thái "Đã giao" (chưa giao
  thì 409). Mỗi đơn tối đa 1 trả hàng đang hoạt động ("Chờ xử lý" hoặc
  "Đã duyệt"); đơn đã có trả hàng đang xử lý thì tạo thêm báo 409. Lý do
  rỗng thì báo 400. Lỗi lúc tạo (sai vai, sai trạng thái đơn, đơn đã có
  trả hàng đang hoạt động) đều không ghi audit, giống tạo shipment sai.
  Trả hàng mới luôn ở trạng thái "Chờ xử lý".
- `get`: đọc 1 trả hàng, không có thì 404. `list`: mọi caller đã xác
  thực đều đọc được, lọc theo `?orderId=` và `?status=`.
- `approve`: chỉ Quản lý hoặc Quản trị viên, chỉ từ "Chờ xử lý" sang
  "Đã duyệt". Kiểm trạng thái trước, kiểm vai sau.
- `reject`: chỉ Quản lý hoặc Quản trị viên, chỉ từ "Chờ xử lý" sang
  "Đã từ chối", bắt buộc có lý do (thiếu thì 400).
- `refund`: chỉ Điều phối viên, chỉ từ "Đã duyệt" sang "Đã hoàn tiền".
- Chuyển trạng thái sai (sai trạng thái hoặc sai vai) thì báo 409 và ghi
  audit `return.transition.denied`, giống sự kiện giao hàng ghi tay sai.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak, trường
  orderId của audit mang mã đơn (`return.created`, `return.approved`,
  `return.rejected`, `return.refunded`), theo tiền lệ các mô đun khác
  dùng chung trường này cho mã thực thể nghiệp vụ.
- Kho trả hàng nằm sau interface `ReturnStore`. Khi chạy thật, kho là
  Postgres (`PostgresReturnStore`, bảng `returns`, lưu bền qua
  `src/db/`); bản bộ nhớ (`InMemoryReturnStore`) chỉ dùng trong kiểm thử
  đơn vị. Số thứ tự trả hàng (TH-1001...) tiếp tục từ số lớn nhất đã có
  trong kho, khởi động lại API không quay về TH-1001.

## Hạn chế đã biết

- Lưu trả hàng và lưu đơn là các bước nối tiếp, không chung 1 giao dịch
  (cùng loại hạn chế với commit lưu bền Postgres): sự cố giữa các bước
  có thể để trả hàng đã lưu mà đơn chưa kịp đổi trạng thái, nhưng tạo trả
  hàng không đổi trạng thái đơn nên không lệch theo đơn.
- Phê duyệt trả hàng CHƯA nối làm hướng xử lý để đóng đơn (Đơn Đã giao
  sang Hoàn vẫn cần `handling` nhập tay ở chuyển đơn): nối 2 việc này
  với nhau là quyết định tiếp theo, chưa làm trong mô đun này.
- Chưa kiểm chứng với Postgres thật và chưa gọi qua HTTP thật, chỉ mới
  trên pg-mem.
