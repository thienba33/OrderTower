<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun assignment

Assignment là 1 phân đơn: điều phối viên giao 1 đơn cho 1 tài khoản để
gọi điện (telesale) hoặc để đóng gói (kho). Người nhận tự bắt đầu xử lý;
phân đơn kho hoàn thành bằng nút hoàn thành, phân đơn telesale hoàn
thành bằng cách ghi nhật ký cuộc gọi. CallLog là 1 nhật ký cuộc gọi:
nhân viên CSKH ghi lại kết quả gọi cho đơn được phân telesale. Không có
endpoint xóa: phân đơn và nhật ký đã tạo còn lại làm dữ liệu lịch sử, dù
đã hủy hay đã hoàn thành.

- `create`: chỉ Điều phối viên. Đơn phải có thật (không có thì 404,
  không ghi audit). Loại chỉ là "telesale" hoặc "warehouse" (sai thì
  400), tên tài khoản được giao không được rỗng (400). Mỗi đơn tối đa 1
  phân đơn đang hoạt động ("Chờ xử lý" hoặc "Đang xử lý") theo từng
  loại; đơn đã có phân đơn cùng loại đang xử lý thì tạo thêm báo 409.
  Hai loại khác nhau không chặn nhau. Phân đơn mới luôn ở trạng thái
  "Chờ xử lý", người giao lấy từ token.
- `get`: đọc 1 phân đơn, không có thì 404. `list`: mọi caller đã xác
  thực đều đọc được, lọc theo `?orderId=`, `?assignedTo=`, `?kind=` và
  `?status=`.
- `start`: người được giao hoặc Điều phối viên, chỉ từ "Chờ xử lý" sang
  "Đang xử lý". Kiểm trạng thái trước, kiểm quyền sau.
- `complete`: chỉ phân đơn kho (phân đơn telesale báo 400, hoàn thành
  bằng nhật ký cuộc gọi), người được giao hoặc Điều phối viên, chỉ từ
  "Đang xử lý" sang "Hoàn thành".
- `cancel`: chỉ Điều phối viên, chỉ khi phân đơn còn đang hoạt động
  ("Chờ xử lý" hoặc "Đang xử lý"), bắt buộc có lý do (thiếu thì 400).
  Lý do hủy lưu vào `cancelReason`.
- Chuyển trạng thái sai (sai trạng thái hoặc sai quyền) thì báo 409 và
  ghi audit `assignment.transition.denied`. Lỗi lúc tạo (sai vai, đơn
  đã có phân đơn cùng loại đang xử lý) không ghi audit, giống tạo trả
  hàng sai.
- `create` nhật ký cuộc gọi: chỉ Nhân viên chăm sóc khách hàng. Phân
  đơn phải có thật (404), phải là loại telesale (400), phải ở "Đang xử
  lý" (409) và người gọi phải đúng người được giao (409). Kết quả chỉ
  là "Thành công" hoặc "Thất bại" (400), thời lượng phải là số giây
  không âm (400). Ghi xong thì phân đơn tự sang "Hoàn thành" và ghi 2
  audit: `call-log.created` và `assignment.completed`.
- `list` nhật ký: mọi caller đã xác thực đều đọc được, lọc theo
  `?orderId=`, `?caller=` và `?assignmentId=`.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak,
  trường orderId của audit mang mã đơn (`assignment.created`,
  `assignment.started`, `assignment.completed`,
  `assignment.cancelled`, `call-log.created`), theo tiền lệ các mô đun
  khác dùng chung trường này cho mã thực thể nghiệp vụ.
- Kho phân đơn và kho nhật ký nằm sau interface `AssignmentStore` và
  `CallLogStore`. Khi chạy thật, kho là Postgres
  (`PostgresAssignmentStore`, bảng `assignments`;
  `PostgresCallLogStore`, bảng `call_logs`, lưu bền qua `src/db/`); bản
  bộ nhớ (`InMemoryAssignmentStore`, `InMemoryCallLogStore`) chỉ dùng
  trong kiểm thử đơn vị. Số thứ tự (PC-1001..., CG-1001...) tiếp tục từ
  số lớn nhất đã có trong kho, khởi động lại API không quay về PC-1001
  hay CG-1001.

## Hạn chế đã biết

- Lưu nhật ký cuộc gọi và đổi trạng thái phân đơn là 2 bước nối tiếp,
  không chung 1 giao dịch (cùng loại hạn chế với các mô đun khác): sự
  cố giữa 2 bước có thể để nhật ký đã lưu mà phân đơn chưa kịp sang
  "Hoàn thành".
- Người được giao là tên tài khoản dạng chuỗi, không kiểm tra tài khoản
  có thật trong Keycloak: API không có cổng đọc danh sách người dùng
  Keycloak, nên tên sai chính tả vẫn tạo được phân đơn.
- Chưa kiểm chứng với Postgres thật và chưa gọi qua HTTP thật, chỉ mới
  trên pg-mem.
