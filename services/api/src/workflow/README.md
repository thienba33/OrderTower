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
- Kho instance nằm sau interface `WorkflowInstanceStore`. Khi chạy thật, kho
  là Postgres (`PostgresWorkflowInstanceStore`, bảng `workflow_instances` và
  `workflow_instance_history`, lưu bền qua `src/db/`); bản bộ nhớ
  (`InMemoryWorkflowInstanceStore`) chỉ dùng trong kiểm thử đơn vị. Số thứ tự
  instance (WF-1001...) tiếp tục từ số lớn nhất đã có trong kho, khởi động
  lại API không quay về WF-1001.

## Task inbox và SLA

`GET /api/workflow/tasks` trả các instance đang active mà vai của người gọi
được phép chuyển tiếp. Mỗi task gồm trạng thái hiện tại, các transition được
phép, hạn xử lý (`dueAt`), `slaState` (`normal`, `due-soon`, `overdue`) và
thời gian chờ. Tài xế chỉ thấy task thuộc đơn mình phụ trách; không có DB để
đối chiếu thì trả rỗng thay vì lộ đơn của tài xế khác.

Query hỗ trợ `definitionId`, `businessKey`, `overdue=true`, `limit`.

## Version pinning và deployment

- Mỗi file JSON là một version; instance lưu `definitionVersion` lúc start và
  transition/guard dùng đúng version đó, kể cả khi version active đổi.
- Khi chưa có quyết định deploy, version thấp nhất là active để file mới chưa
  duyệt không tự chạy.
- `GET /api/workflow/definitions/:definitionId/versions` xem version active.
- `POST /api/workflow/definitions/:definitionId/versions/:version/deployment-requests`
  tạo approval `workflow.definition.deploy`.
- `POST /api/workflow/definitions/:definitionId/versions/:version/activate`
  chỉ chạy khi approval đã duyệt và chưa dùng; version active lưu ở
  `workflow_active_versions`, restart API vẫn giữ.

## Xác thực và phân quyền

Mọi endpoint (trừ `GET /api/health`) cần access token Keycloak hợp lệ
(`Authorization: Bearer <token>`). API tự xác thực token bằng JWKS lấy từ
Keycloak (`KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`),
kiểm tra issuer từ tài liệu discovery và audience là client
`ordertower-web`. Vai lấy từ client role của Keycloak, dịch sang tên vai
nghiệp vụ trong tệp định nghĩa luồng theo bảng ở `src/auth/roles.ts` (vai
trong realm là `ordertower-realm.json`). Người gọi và vai ghi vào lịch sử và
audit đều lấy từ token, không nhận actor/role từ body.

Bài kiểm tra nghiệm thu: đổi tệp định nghĩa, khởi động lại engine, luồng mới
chạy được mà không sửa code API; thử chuyển trạng thái trái phép và phải bị
từ chối kèm log.
