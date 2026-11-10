<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mô-đun Workflow

Định nghĩa luồng nằm trong tệp JSON có phiên bản ở `definitions/`. Quy tắc:

- Phiên bản mới là tệp mới (`order-flow.v2.json`), không sửa tệp đã phát hành.
- Engine nạp mọi tệp JSON trong thư mục thành registry, mỗi tệp là 1 luồng
  riêng. Thêm luồng mới cho ứng dụng khác chỉ cần thêm 1 tệp, engine và API
  instance dùng lại nguyên vẹn, không sửa code.
- Trạng thái đầu là phần tử đầu tiên của `states`; trạng thái cuối là trạng
  thái không còn chuyển nào đi ra.
- Engine đọc tệp định nghĩa để quyết định chuyển trạng thái được phép, ghi
  lịch sử từng bước, lưu người duyệt, cho quay lui có kiểm soát và từ chối
  chuyển trạng thái trái phép kèm lý do.
- Mọi chuyển trạng thái đều ghi audit log chỉ ghi thêm kèm hash nối chuỗi.

## Workflow instance

Một lượt chạy của 1 định nghĩa luồng, quản lý bởi `WorkflowInstanceService`:

- `start` mở instance ở trạng thái đầu, 1 `businessKey` chỉ có 1 instance cho
  mỗi luồng. Trạng thái luồng và lịch sử sống ở instance; thực thể nghiệp vụ
  (đơn hàng...) chỉ giữ `businessKey` và `workflowInstanceId`.
- `transition` chỉ cho chuyển có trong định nghĩa và đúng vai, tới trạng thái
  cuối thì instance chuyển sang `completed`.
- `suspend` / `resume` tạm dừng và tiếp tục instance đang chạy; `terminate`
  kết thúc instance, bắt buộc có lý do. Quay lui chỉ qua chuyển đã định
  nghĩa, không có nhảy trạng thái tự do.
- Kho instance nằm sau interface `WorkflowInstanceStore`, hiện là bản bộ nhớ,
  commit lưu bền sẽ thay bằng Postgres mà service phía trên không đổi.

Bài kiểm tra nghiệm thu: đổi tệp định nghĩa, khởi động lại engine, luồng mới
chạy được mà không sửa code API; thử chuyển trạng thái trái phép và phải bị
từ chối kèm log.
