<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun tickets

Ticket CSKH là 1 yêu cầu của khách gắn với 1 mã đơn, theo đúng màn Chăm
sóc khách hàng đã vẽ: mỗi dòng là 1 ticket (mã ticket, mã khách, mã đơn,
loại, kênh, nội dung, trạng thái, người xử lý, giờ cập nhật, nhóm "chưa
gọi lại"). Không có endpoint xóa hay sửa nội dung: ticket đã tạo chỉ đổi
trạng thái xuôi từng bước, còn lại làm dữ liệu lịch sử.

- `create`: Nhân viên chăm sóc khách hàng, Quản lý hoặc Quản trị viên.
  Mã khách, mã đơn, loại, kênh, nội dung đều bắt buộc (thiếu thì 400);
  loại phải là 1 trong 5 loại, kênh phải là 1 trong 3 kênh (sai thì 400).
  Ticket mới luôn ở trạng thái "Mới", người xử lý mặc định "Chưa gán",
  vào nhóm "chưa gọi lại" khi loại là "Giao trễ" hoặc khi lúc tạo có ghi
  chú cần gọi lại (`needsCall: true`). Mã đơn là chuỗi tự do, KHÔNG
  kiểm tra đơn có thật: 14 dòng mẫu tham chiếu DH-1015 đến DH-1058,
  không tồn tại trong seed đơn, nên không đặt khóa ngoại tới bảng orders.
  Người tạo lấy từ token. Lỗi lúc tạo (sai vai, thiếu trường) không ghi
  audit, giống tạo cờ hạn chế sai vai.
- `get` và `list`: mọi caller đã xác thực đều đọc được, lọc theo
  `?type=`, `?status=`, `?channel=`, `?needsCall=true|false` và tìm kiếm
  `?q=` theo mã ticket, mã khách hoặc mã đơn (khớp 1 phần, không phân
  biệt hoa thường). Kết quả xếp theo mã ticket giảm dần (mới nhất lên
  đầu).
- `kpis`: 4 KPI đầu của màn CSKH, tính từ DB lúc đọc, không lưu bền:
  "Yêu cầu mới" là số ticket ở trạng thái "Mới"; "Đang xử lý" là số
  ticket ở trạng thái "Đang xử lý"; "Chờ khách phản hồi" là số ticket ở
  trạng thái "Chờ khách"; "Đã đóng hôm nay" là số ticket đóng trong ngày
  hiện tại theo giờ Việt Nam, tính theo `closedAt`, không phải số dòng
  đang ở trạng thái "Đã đóng". KPI thứ 5 (Hoàn / trả chờ xử lý) đã nối
  API thật từ PR #59, không tính ở đây.
- `changeStatus` (PATCH /tickets/:id/status): Nhân viên chăm sóc khách
  hàng, Quản lý hoặc Quản trị viên, chỉ đi xuôi 1 bước mỗi lần ("Mới" ->
  "Đang xử lý" -> "Chờ khách" -> "Đã đóng"), không nhảy cóc, không quay
  lại. Trạng thái đích sai định dạng thì 400; sai bước hoặc sai vai thì
  409 và ghi audit `ticket.transition.denied`. Kiểm trạng thái trước,
  kiểm quyền sau, giống thứ tự ở cờ hạn chế và phân đơn. Đóng ticket thì
  ghi `closedAt` là thời điểm đóng.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak,
  trường orderId của audit mang mã đơn của ticket (`ticket.created`,
  `ticket.status.changed`), theo tiền lệ các mô đun khác dùng chung
  trường này cho mã thực thể nghiệp vụ.

## Seed dữ liệu mẫu đóng băng

Khi bảng tickets còn trống, service nạp 14 dòng mẫu đóng băng ngày
02/11/2026 từ `data/tickets.seed.json` (giữ nguyên từng giá trị trong
`apps/web/data/cskh.ts`): YC-018 đến YC-031, 4 trạng thái, 5 loại, 3
kênh, 6 dòng "chưa gọi lại". Giờ cập nhật HH:MM trong tệp seed là giờ
trong ngày 02/11/2026, lúc seed chuyển thành `createdAt`/`updatedAt`
ISO; 3 dòng "Đã đóng" có `closedAt` cùng giờ đó, nên KPI "Đã đóng hôm
nay" bằng 0 cho đến khi có ticket đóng trong ngày hiện tại. Đã có dữ
liệu thì giữ nguyên, khởi động lại không nạp lại. Tệp seed sai vẫn chặn
khởi động, giống kho tồn kho. Đổi tệp seed bằng biến môi trường
`TICKETS_SEED_PATH`. Bảng mới nên không cần xóa DB trên máy đang chạy
để có dữ liệu mẫu, khác với seed lịch sử ở PR #71.

## Hạn chế đã biết

- Lịch sử liên hệ 4 dòng ở màn CSKH vẫn là dữ liệu mẫu đóng băng, chưa
  nối sang API CallLog trong đợt này (theo bản dự thảo mốc 3, mục 6):
  CallLog bắt đầu trống, nối sang thì màn sẽ hiện trống cho đến khi CSKH
  ghi nhật ký cuộc gọi thật. Quyết sau mốc 3 cùng với 3 tab còn lại của
  Telesale.
- Không có endpoint sửa nội dung hay xóa ticket. Muốn sửa nội dung thì
  thêm endpoint riêng kèm phê duyệt, giống sửa đơn đã đóng.
- Kho ticket nằm sau interface `TicketStore`. Khi chạy thật, kho là
  Postgres (`PostgresTicketStore`, bảng `tickets`, lưu bền qua
  `src/db/`); bản bộ nhớ (`InMemoryTicketStore`) chỉ dùng trong kiểm thử
  đơn vị. Số thứ tự (YC-1001...) tiếp tục từ số lớn nhất đã có trong
  kho, khởi động lại API không quay về YC-1001.
- Chưa kiểm chứng với Postgres thật và chưa gọi qua HTTP thật, chỉ mới
  trên pg-mem.
