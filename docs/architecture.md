<!-- SPDX-License-Identifier: Apache-2.0 -->
# Kiến trúc

Tài liệu này mô tả code thật trong repo ở thời điểm Mốc 2 (19/11/2026).
Phần nào chưa có thì ghi trong mục "Chưa có", không viết như thể đã xong.

## Tổng quan

Hệ thống có 2 tầng:

- **Tầng 1 (lõi dùng chung):** định danh và SSO (Keycloak), cổng API
  (APISIX), Postgres 16, kho đối tượng (SeaweedFS mini) và Workflow
  engine tự viết trong NestJS. Tầng này không có giao diện nghiệp vụ
  cho người dùng cuối, nhưng thiết kế để cắm thêm ứng dụng khác.
- **Tầng 2 (ứng dụng duy nhất):** OrderTower, web Next.js 14 cho điều
  hành đơn hàng của một hộ kinh doanh nhỏ.

Luồng gọi: trình duyệt -> APISIX (:9080) -> API NestJS (:3001) ->
Postgres. Keycloak chạy sau APISIX, chỉ phục vụ đăng nhập và cấp token.
API tự xác thực token bằng JWKS lấy từ Keycloak nội bộ, không tin
header do gateway gắn thêm.

## Stack đã chốt

| Thành phần | Lựa chọn |
| --- | --- |
| API | NestJS 12.4.2, TypeScript 5.9.3, `pg` 8.23.1, `jose` 6.2.17 |
| Workflow engine | Mô-đun tự viết trong NestJS, định nghĩa luồng dạng tệp JSON có phiên bản |
| Cơ sở dữ liệu | Postgres 16, migration SQL viết tay có phiên bản (001-009) |
| Kho đối tượng | SeaweedFS 4.51 chế độ `weed mini` |
| Cổng API | APISIX 3.19.0-debian standalone, không dùng etcd |
| Định danh và SSO | Keycloak 26.8.1, realm `ordertower`, client `ordertower-web` |
| Web | Next.js 14.2.35, React 18.3.1, Tailwind 3.4.17, TypeScript 5.6.3 |
| Hạ tầng chạy | Docker Compose, 6 dịch vụ: postgres, keycloak, apisix, seaweedfs, api, web |

Không dùng trong MVP: Flowable, Qdrant, PostGIS, MinIO, TypeORM, Prisma.

## API (services/api)

### Mô-đun

| Mô-đun | Trách nhiệm |
| --- | --- |
| workflow | Registry đọc mọi tệp `*.json` trong thư mục định nghĩa; instance có vòng đời riêng (tạm dừng, tiếp tục, kết thúc); chuyển trạng thái chỉ qua định nghĩa |
| orders | Đơn hàng, 9 trạng thái, 10 chuyển trạng thái; kiểm tra trùng mã idempotency, tồn kho, độ tin cậy địa chỉ, hướng xử lý khi đóng đơn |
| approvals | Phê duyệt chung: chỉ trạng thái chờ duyệt mới duyệt được, người xin không tự duyệt, từ chối bắt buộc có lý do, 1 phê duyệt chỉ dùng 1 lần |
| audit | Nhật ký chỉ thêm không sửa, nối chuỗi hash SHA-256, endpoint `/api/audit/verify` kiểm chứng chuỗi |
| auth | Guard toàn cục, chỉ `GET /api/health` là công khai; xác thực JWT Keycloak qua JWKS nội bộ, ánh xạ role Keycloak sang tên vai trò nghiệp vụ |
| address | Bảng địa danh 3 tỉnh (Hà Nội, Hải Phòng, Quảng Ninh); chấm tin cậy tỉnh 40 + quận/huyện 30 + phường/xã 20 + địa chỉ chi tiết 10, ngưỡng tối thiểu 70 |
| inventory | Tồn kho theo SKU, 11 SKU có sẵn; số tồn hiển thị là số còn dùng được (tồn trừ giữ chỗ) |
| shipments | Shipment 5 trạng thái, tối đa 1 shipment đang mở mỗi đơn; điều xe cần tài xế và xe thật đang sẵn sàng; giao hàng cần mã khóa ảnh bằng chứng |
| vehicles | Xe, biển số duy nhất, 3 trạng thái (Sẵn sàng, Đang giao, Bảo trì) |
| drivers | Tài xế, số điện thoại và tên đăng nhập duy nhất; tài xế chỉ giao hoặc báo thất bại shipment của chính mình |
| delivery-events | Nhật ký giao hàng chỉ thêm không sửa; sự kiện tự động khi điều xe, giao hàng, báo thất bại; không có trường GPS |
| channels | Kênh Chat, Web, Điện thoại; đơn hàng kiểm tra channelId tồn tại |
| returns | Hoàn hàng, chỉ tạo khi đơn đã giao và chỉ 1 hoàn đang mở mỗi đơn; duyệt/từ chối chỉ Quản lý và Quản trị viên, hoàn tiền chỉ Điều phối viên |
| customers | Khách hàng, số điện thoại duy nhất; đơn hàng kiểm tra customerId tồn tại |
| db | Pool `pg`, chạy migration theo thứ tự, lỗi thiếu `DATABASE_URL` thì dừng ngay khi khởi động |

### Lưu bền

Migration SQL viết tay trong `src/db/migrations/`:

- 001: 8 bảng khởi tạo (đơn, workflow instance, audit, phê duyệt, tồn kho và bảng phụ)
- 002: shipments; 003: vehicles; 004: drivers; 005: delivery-events
- 006: channels + `orders.channel_id`; 007: returns
- 008: customers + `orders.customer_id`
- 009: trường đơn (số điện thoại, mốc giao hẹn, tổng tiền) + giá đơn vị trong kho

Mỗi mô-đun có interface store và bản cài đặt Postgres riêng; store
trong bộ nhớ chỉ giữ lại cho test đơn vị. Test: 224 test, 17 suite,
chạy bằng `npm test` (Jest chạy với `node --experimental-vm-modules`).
Giới hạn đã biết: lưu nhiều thực thể liên quan là nhiều bước nối tiếp,
không phải 1 giao dịch chung; chưa kiểm chứng trên Postgres thật.

### Luồng đơn và rào chắn

Định nghĩa luồng `services/api/src/workflow/definitions/order-flow.v1.json`
(definitionId `order-flow`, version 1): 9 trạng thái (Mới tạo, Đã kiểm
tra, Chờ kho, Đang đóng gói, Chờ điều xe, Đang giao, Đã giao, Hoàn,
Hủy), 10 chuyển trạng thái, mỗi chuyển trạng thái ghi rõ vai trò được
phép và rào chắn áp dụng.

5 rào chắn: không xác nhận trùng đơn; không chuyển kho khi tồn không
đủ; không điều xe khi độ tin cậy địa chỉ dưới ngưỡng; không đóng đơn
khi thiếu hướng xử lý; không sửa đơn đã đóng khi thiếu lý do và phê
duyệt. Chuyển trạng thái trái phép bị từ chối kèm lý do và ghi audit
`order.transition.denied`. Sửa đơn đã đóng cần phê duyệt loại
`order.edit.closed` đã duyệt, đúng đơn, chưa dùng.

Audit: mỗi bản ghi có số thứ tự, hash của bản ghi trước và hash của
chính nó (SHA-256). Endpoint verify kiểm tra toàn chuỗi và báo bản ghi
đầu tiên bị hỏng nếu có. 5 điểm phê duyệt trong luồng: xác nhận đơn
trùng, sửa đơn đã đóng, duyệt đề xuất hoàn hàng, duyệt phân công vượt
quy tắc, duyệt thay đổi định nghĩa luồng.

### Xác thực và phân quyền

- Web dùng luồng Authorization Code + PKCE S256 với Keycloak. Người
  dùng bấm nút đăng nhập, Keycloak xác thực, web đổi code lấy token ở
  phía server. Token chỉ nằm trong cookie httpOnly, không có form
  tên đăng nhập và mật khẩu nào trong web.
- API xác thực JWT bằng `jose` qua JWKS nội bộ
  (`KEYCLOAK_INTERNAL_URL`, mặc định `http://keycloak:8080`). Vai trò
  Keycloak ánh xạ sang tên nghiệp vụ: admin -> Quản trị viên,
  dispatcher -> Điều phối viên, warehouse-staff -> Nhân viên kho,
  customer-service -> Nhân viên chăm sóc khách hàng, driver -> Tài xế,
  manager -> Quản lý, customer -> Khách hàng mô phỏng. Vai trò không
  có trong bảng ánh xạ bị bỏ. Người thực hiện và vai trò không bao giờ
  lấy từ body request.
- Tài khoản demo trong realm `ordertower`: `demo.admin`,
  `demo.dispatcher`, `demo.warehouse-staff`, `demo.customer-service`,
  `demo.driver`, `demo.manager`, `demo.customer`; mật khẩu demo đặt
  qua biến môi trường, không ghi trong repo.

## Web (apps/web)

Next.js 14 App Router, server component gọi API thật qua `lib/api.ts`
(`apiFetch`, token lấy từ cookie httpOnly). Khi chưa đăng nhập, trang
hiện dòng nhắc đăng nhập thay vì dữ liệu mẫu. Dữ liệu mẫu cũ trong
`apps/web/data/` giữ nguyên, không dùng nữa ở các màn đã nối.

12 màn đã nối API thật:

| Màn | Đường dẫn | Nguồn API chính |
| --- | --- | --- |
| Đăng nhập | nút trên header | Keycloak PKCE, `lib/auth.ts` |
| Danh sách đơn | /orders | GET /api/orders, POST /api/orders |
| Chi tiết đơn | /orders/[id] | GET /api/orders/:id, chuyển trạng thái, audit |
| Giao hàng | trên trang chi tiết đơn | POST /api/shipments, dispatch/deliver/fail/cancel |
| Hàng đợi duyệt | /approval-queue | GET /api/approvals, approve/reject |
| Theo dõi đơn hàng | /tracking | GET /api/orders/:id + lịch sử + sự kiện giao hàng |
| Tài xế | /driver, /driver/[id] | GET /api/shipments theo tài xế đăng nhập |
| Tổng quan | / (trang chủ) | GET /api/orders + approvals + audit + inventory |
| Kho | /warehouse | GET /api/inventory |
| Phân tách địa chỉ | /address-split | GET /api/orders + PATCH địa chỉ |
| Quản trị | /admin | GET /api/audit + /api/audit/verify + /api/workflow/definitions |
| Telesale (tab đơn ưu tiên) | /telesale | GET /api/orders, lọc theo quy tắc SLA |

5 màn còn phần chưa nối (vẫn hiển thị dữ liệu mẫu hoặc đã bỏ phần
không có API): Danh sách hạn chế (/restricted-list), BI và DX-Score
(/bi-dx-score), Phân phối đơn (/distribution), Chăm sóc khách hàng
(/customer-care), Telesale 3 tab Tổng quan/Công việc/Nhân viên đã bỏ.

## Hạ tầng và chạy thử

`compose.yaml` chạy 6 dịch vụ. Cổng: APISIX 9080, API 3001, web
3000, Keycloak 9080 qua APISIX và console quản trị 8081 trên máy
local, SeaweedFS 8333/8888/9333. Biến môi trường bắt buộc xem
`.env.example`; API yêu cầu `DATABASE_URL`, `KEYCLOAK_URL`,
`KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID` và
các biến `S3_*`.

Chạy API riêng: `cd services/api && npm install && npm run start:dev`
(cổng 3001, `GET /api/health` là endpoint công khai duy nhất). Chạy
web riêng: `cd apps/web && npm install && npm run dev` (cổng 3000).

CI (`.github/workflows/ci.yml`): kiểm tra giấy phép REUSE và cú pháp
`docker compose config -q` trên mọi PR và khi push lên main. Chưa có
CI chạy test hay build.

## Chưa có

Những mục này thuộc phạm vi Mốc 2 theo kế hoạch nhưng chưa xây, hoặc
đang chờ quyết định. Demo không được trình bày chúng như đã xong.

- **Lớp BI, DX-Score và tính năng AI:** không có mô-đun BI nào trong
  `services/api`, không có endpoint dự báo, phát hiện bất thường hay
  đề xuất; công thức DX-Score chưa đóng băng; màn BI và DX-Score vẫn
  là dữ liệu mẫu; không có mô hình Ollama nào đang chạy.
- **API danh sách hạn chế:** khách hàng chưa có cờ hạn chế, chưa có
  endpoint đưa vào hay gỡ ra khỏi danh sách.
- **API phân công đơn:** chưa có mô hình nhân viên phân công, chưa có
  endpoint gán đơn cho người xử lý.
- **API ticket chăm sóc khách hàng:** chưa có thực thể ticket.
- **API cuộc gọi và nhân viên telesale:** chưa có log cuộc gọi hay
  thống kê nhân viên; 3 tab Telesale đã bỏ chờ API này.
- **Dockerfile cho web:** `apps/web` chưa có Dockerfile nên
  `docker compose up` toàn bộ gãy ở bước build web. Đây là phần của
  Sơn, chưa làm.
- **Kho đối tượng:** SeaweedFS chạy trong Compose và API khai báo biến
  `S3_*`, nhưng chưa có mã tải ảnh lên; bằng chứng giao hàng hiện chỉ
  lưu mã khóa ảnh dạng chuỗi.
- **Phát hành:** chưa có tag hay release GitHub nào; `[Unreleased]`
  trong CHANGELOG.md thành `[0.1.0]` khi gắn tag v0.1.0.
- **Kiểm chứng:** toàn bộ ứng dụng chưa từng demo đầu-cuối; API mới
  chạy standalone với stub OIDC trên máy ảo, chưa kiểm chứng trên
  Postgres thật; 12 màn đã nối mới kiểm chứng ở trạng thái chưa đăng
  nhập, chưa kiểm chứng bằng đăng nhập thật và dữ liệu thật.
