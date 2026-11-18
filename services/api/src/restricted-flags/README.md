<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun restricted-flags

Cờ hạn chế là 1 đơn bị rà soát vì khách hoàn nhiều lần, theo đúng màn
Danh sách hạn chế đã vẽ: mỗi dòng là 1 đơn (mã đơn, ngày đặt, khách, SĐT,
sản phẩm, tỷ lệ hoàn 1 tháng/3 tháng, trạng thái, nguồn, số đơn 3 tháng,
kênh). Cờ gắn với đơn, không gắn trực tiếp với khách: khách vào danh sách
hạn chế khi 1 cờ của họ được duyệt (trạng thái "Hạn chế"). Không có
endpoint xóa: cờ đã tạo còn lại làm dữ liệu lịch sử, dù đã kiểm tra hay
đã hủy.

- `create`: chỉ Nhân viên chăm sóc khách hàng. Đơn phải có thật (không có
  thì 404, không ghi audit). Lý do tùy chọn. Cờ mới luôn ở trạng thái
  "Hoàn nhiều lần", nguồn luôn là "CSKH" trong bản này (2 nguồn "Hệ
  thống" và "AI cảnh báo" dành cho hệ thống gắn cờ sau, chưa có luật gắn
  cờ tự động). SĐT chụp lại từ đơn lúc tạo cờ, mã khách lấy từ đơn (đơn
  mẫu không mang customerId nên 2 trường này có thể null). Mỗi đơn tối đa
  1 cờ đang hoạt động ("Hoàn nhiều lần", "Chờ duyệt thêm" hoặc "Hạn
  chế"); đơn đã có cờ đang xử lý thì tạo thêm báo 409. Người tạo lấy từ
  token.
- `get` và `list`: mọi caller đã xác thực đều đọc được, lọc theo
  `?status=`, `?source=`, `?orderId=` và `?customerId=`. Kết quả trả về
  kèm đơn đầy đủ (`order`) và tỷ lệ hoàn của khách (`stats`, xem dưới).
- `release` ("Cho đi đơn"): chỉ Nhân viên chăm sóc khách hàng, chỉ từ
  "Hoàn nhiều lần" hoặc "Chờ duyệt thêm" sang "Đã kiểm tra". Ghi người
  quyết định và thời điểm quyết định.
- `propose-restrict` (đề xuất hạn chế): chỉ Nhân viên chăm sóc khách
  hàng, chỉ từ "Hoàn nhiều lần" sang "Chờ duyệt thêm", bắt buộc có lý do
  (thiếu thì 400). CSKH chỉ đề xuất, chưa phải quyết định cuối: đề thi
  bắt duyệt tay việc đưa khách vào danh sách hạn chế.
- `approve-restrict` (duyệt hạn chế): chỉ Quản lý hoặc Quản trị viên
  (dùng chung hằng `APPROVER_ROLES` với mô-đun phê duyệt), chỉ từ "Chờ
  duyệt thêm" sang "Hạn chế". Ghi người quyết định và thời điểm quyết
  định. Từ đây khách được tính là đang trong danh sách hạn chế.
- `reject-restrict` (từ chối hạn chế): chỉ Quản lý hoặc Quản trị viên,
  chỉ từ "Chờ duyệt thêm" sang "Đã kiểm tra", bắt buộc có lý do (thiếu
  thì 400). Ghi người quyết định và thời điểm quyết định.
- `cancel` ("Hủy đơn"): Nhân viên chăm sóc khách hàng, Quản lý hoặc Quản
  trị viên, chỉ từ "Hoàn nhiều lần" hoặc "Chờ duyệt thêm" sang "Đã hủy",
  bắt buộc có lý do (thiếu thì 400). Ghi người quyết định và thời điểm
  quyết định.
- Chuyển trạng thái sai (sai trạng thái hoặc sai quyền) thì báo 409 và
  ghi audit `restricted-flag.transition.denied`. Kiểm trạng thái trước,
  kiểm quyền sau, giống thứ tự ở phân đơn và shipment. Lỗi lúc tạo (sai
  vai, đơn đã có cờ đang xử lý) không ghi audit, giống tạo trả hàng sai.
- Mọi sự kiện đều ghi audit với người thật lấy từ token Keycloak,
  trường orderId của audit mang mã đơn (`restricted-flag.created`,
  `restricted-flag.released`, `restricted-flag.restrict-proposed`,
  `restricted-flag.restrict-approved`,
  `restricted-flag.restrict-rejected`, `restricted-flag.cancelled`),
  theo tiền lệ các mô đun khác dùng chung trường này cho mã thực thể
  nghiệp vụ.

## Tỷ lệ hoàn (stats)

`stats` tính trực tiếp lúc đọc từ đơn và trả hàng, không lưu bền:

- `return1m`: số trả hàng tạo trong 30 ngày qua của khách chia số đơn
  tạo trong 30 ngày qua của khách, nhân 100, làm tròn. 0 khi khách không
  có đơn nào trong 30 ngày qua.
- `return3m`: cùng cách tính với cửa sổ 90 ngày.
- `orders3m`: số đơn của khách tạo trong 90 ngày qua.

Khóa nối là SĐT, không phải mã khách: đơn mẫu không mang customerId
(đơn tạo từ seed chỉ có tên khách dạng chuỗi và SĐT), nên SĐT là liên kết
thật duy nhất giữa đơn, trả hàng và cờ. Trả hàng gắn với khách qua đơn
của khách (kể cả đơn tạo trước cửa sổ); đơn gắn với khách khi SĐT trùng
khớp. Cờ của đơn không có SĐT thì `stats` toàn 0.

## "Hủy đơn" chỉ ghi quyết định trên cờ, không hủy đơn thật

Nút "Hủy đơn" ở màn danh sách hạn chế KHÔNG chuyển trạng thái đơn. Lý
do: định nghĩa luồng `order-flow.v1.json` chỉ cho hủy đơn từ "Mới tạo"
hoặc "Đã kiểm tra", và chỉ bởi vai Điều phối viên; còn màn này chỉ có
CSKH và quản lý được vào. Nối chuyển đơn vào đây sẽ hoặc đi ngược định
nghĩa luồng, hoặc báo 409 trong demo. Đơn vẫn hủy được như thường: điều
phối viên mở chi tiết đơn và hủy ở đó. Ghi chú này cũng nằm trong
`detail` của audit `restricted-flag.cancelled` để người đọc log không
hiểu nhầm.

## Hạn chế đã biết

- Khách được tính là đang trong danh sách hạn chế khi có cờ ở trạng thái
  "Hạn chế"; mô-đun Customer chưa có cờ hạn chế riêng. Muốn chặn đơn mới
  của khách hạn chế (nếu đề thi yêu cầu sau này) thì thêm rào chắn ở
  OrdersService đọc cờ ở đây, không thêm trường vào Customer.
- Chưa có luật gắn cờ tự động: nguồn "Hệ thống" và "AI cảnh báo" chưa
  được tạo cờ nào; muốn tự động gắn cờ khi tỷ lệ hoàn vượt ngưỡng thì
  thêm 1 tác vụ quét dùng chung hàm tính tỷ lệ ở đây.
- Chưa có seed: cờ bắt đầu trống, CSKH tạo trong demo, giống phân đơn
  và nhật ký cuộc gọi.
- Kho cờ nằm sau interface `RestrictedFlagStore`. Khi chạy thật, kho là
  Postgres (`PostgresRestrictedFlagStore`, bảng `restricted_flags`, lưu
  bền qua `src/db/`); bản bộ nhớ (`InMemoryRestrictedFlagStore`) chỉ
  dùng trong kiểm thử đơn vị. Số thứ tự (HG-1001...) tiếp tục từ số lớn
  nhất đã có trong kho, khởi động lại API không quay về HG-1001.
- Chưa kiểm chứng với Postgres thật và chưa gọi qua HTTP thật, chỉ mới
  trên pg-mem.
