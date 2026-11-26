<!-- SPDX-License-Identifier: Apache-2.0 -->
# Kiến trúc
## Tổng quan

Hệ thống có 2 tầng:

- **Tầng 1 (lõi dùng chung):** định danh, SSO và phân quyền RBAC (Keycloak +
  `AuthGuard`/`RolesGuard`), cổng API (APISIX), Postgres 16, kho đối tượng
  (SeaweedFS mini) kèm kiểm dịch ClamAV (`storage`), Workflow engine tự viết
  trong NestJS, nhật ký `audit` nối chuỗi hash SHA-256 và mô-đun `approvals`.
  Tầng này không có giao diện nghiệp vụ cho người dùng cuối, nhưng thiết kế để
  cắm thêm ứng dụng khác.
- **Tầng 2 (ứng dụng duy nhất):** OrderTower, web Next.js 14 cho điều
  hành đơn hàng của một hộ kinh doanh nhỏ.

Luồng gọi: trình duyệt -> APISIX (:9080) -> API NestJS (:3001) ->
Postgres / SeaweedFS / ClamAV. Keycloak chạy sau APISIX, chỉ phục vụ đăng nhập
và cấp token. API tự xác thực token bằng JWKS lấy từ Keycloak nội bộ, không tin
header do gateway gắn thêm.

## Stack đã chốt

| Thành phần | Lựa chọn |
| --- | --- |
| API | NestJS 12.4.2, TypeScript 5.9.3, `pg` 8.23.1, `jose` 6.2.17, `@aws-sdk/client-s3` 3.1177.0 |
| Workflow engine | Mô-đun tự viết trong NestJS, định nghĩa luồng dạng tệp JSON có phiên bản |
| Cơ sở dữ liệu | Postgres 16, migration SQL viết tay có phiên bản (001-014) |
| Kho đối tượng | SeaweedFS 4.51 chế độ `weed mini` (S3) |
| Kiểm dịch upload | ClamAV (`clamav/clamav:stable`), giao tiếp TCP `INSTREAM` cổng 3310 |
| Cổng API | APISIX 3.19.0-debian standalone, không dùng etcd |
| Định danh và SSO | Keycloak 26.8.1, realm `ordertower`, client `ordertower-web` |
| Web | Next.js 14.2.35, React 18.3.1, Tailwind 3.4.17, TypeScript 5.6.3 |
| Hạ tầng chạy | Docker Compose, 7 dịch vụ: `postgres`, `keycloak`, `apisix`, `seaweedfs`, `clamav`, `api`, `web` |

Không dùng trong MVP: Flowable, Qdrant, PostGIS, MinIO, TypeORM, Prisma.

## API (services/api)

### Mô-đun

| Mô-đun | Trách nhiệm |
| --- | --- |
| workflow | Registry đọc mọi tệp `*.json` trong thư mục định nghĩa; instance có vòng đời riêng (tạm dừng, tiếp tục, kết thúc); chuyển trạng thái chỉ qua định nghĩa |
| orders | Đơn hàng, 9 trạng thái, 10 chuyển trạng thái; kiểm tra trùng mã idempotency, tồn kho, độ tin cậy địa chỉ, hướng xử lý khi đóng đơn |
| approvals | Phê duyệt chung: chỉ trạng thái chờ duyệt mới duyệt được, người xin không tự duyệt, từ chối bắt buộc có lý do, 1 phê duyệt chỉ dùng 1 lần |
| audit | Nhật ký chỉ thêm không sửa, nối chuỗi hash SHA-256, endpoint `/api/audit/verify` kiểm chứng chuỗi |
| auth | Guard toàn cục (`AuthGuard` + `RolesGuard`), chỉ `GET /api/health` và `GET /api/public/tracking` là công khai (`@Public`); xác thực JWT Keycloak qua JWKS nội bộ, ánh xạ role Keycloak sang tên vai trò nghiệp vụ và kiểm tra quyền từng endpoint bằng `@Roles` (`src/auth/permissions.ts`) |
| address | Bảng địa danh 3 tỉnh (Hà Nội, Hải Phòng, Quảng Ninh); chấm tin cậy tỉnh 40 + quận/huyện 30 + phường/xã 20 + địa chỉ chi tiết 10, ngưỡng tối thiểu 70 |
| inventory | Tồn kho theo SKU, 40 SKU có sẵn; số tồn hiển thị là số còn dùng được (tồn trừ giữ chỗ) |
| shipments | Shipment 5 trạng thái, tối đa 1 shipment đang mở mỗi đơn; điều xe cần tài xế và xe thật đang sẵn sàng; giao hàng cần ảnh bằng chứng (`proofPhotoFileId` hoặc `proofPhotoKey`); tài xế chỉ xem/thao tác shipment của chính mình |
| vehicles | Xe, biển số duy nhất, 3 trạng thái (Sẵn sàng, Đang giao, Bảo trì) |
| drivers | Tài xế, số điện thoại và tên đăng nhập duy nhất; tài xế chỉ giao hoặc báo thất bại shipment của chính mình |
| delivery-events | Nhật ký giao hàng chỉ thêm không sửa; sự kiện tự động khi điều xe, giao hàng, báo thất bại; không có trường GPS; tài xế chỉ xem sự kiện thuộc shipment của mình |
| channels | Kênh Chat, Web, Điện thoại; đơn hàng kiểm tra channelId tồn tại |
| returns | Hoàn hàng, chỉ tạo khi đơn đã giao và chỉ 1 hoàn đang mở mỗi đơn; duyệt/từ chối chỉ Quản lý và Quản trị viên, hoàn tiền chỉ Điều phối viên |
| customers | Khách hàng, số điện thoại duy nhất; đơn hàng kiểm tra customerId tồn tại |
| assignments | Phân công đơn telesale và kho, nhật ký cuộc gọi; điều phối viên chia đơn, nhân viên chăm sóc khách hàng ghi log cuộc gọi; tối đa 1 phân công đang mở mỗi loại trên mỗi đơn |
| restricted-flags | Cờ hoàn nhiều lần và đề xuất hạn chế; CSKH tạo và đề xuất, Quản lý và Quản trị viên duyệt hoặc từ chối; khách hạn chế suy ra từ cờ, không lưu cờ trên khách hàng |
| public-tracking | Tra cứu đơn công khai bằng mã đơn và số điện thoại; không trả số điện thoại, hash audit hay thông tin nội bộ |
| bi | Lớp BI pilot dùng quy tắc xác định (`src/bi/`): dự báo nhu cầu theo SKU/kênh, phát hiện 3 bất thường, sinh đề xuất hành động kèm đầu vào đối soát, duyệt/từ chối và ghi phản hồi (`Quản lý`/`Quản trị viên`), tính và lưu snapshot `DX-Score v1` (H-P-D-I, tổng 100) |
| tickets | Ticket CSKH tối thiểu (`src/tickets/`): tạo và chuyển trạng thái xuôi 1 chiều (`Mới` -> `Đang xử lý` -> `Chờ khách` -> `Đã đóng`), tính 4 KPI trực tiếp từ DB, nạp 14 mẫu đóng băng (`YC-018`..`YC-031`) khi bảng trống |
| storage | Dịch vụ file dùng chung Tầng 1 (`src/storage/`): upload (`POST /api/files`), tải nội dung (`GET /api/files/:id/content`), xóa mềm; lưu trên SeaweedFS S3 qua `@aws-sdk/client-s3`, quét ClamAV qua `INSTREAM` (fail-closed khi `CLAMAV_REQUIRED=true`), hỗ trợ ảnh bằng chứng giao hàng |
| seed | `HistoricalSeedService` (`src/seed/`) nạp 112 đơn lịch sử (`LS-1001`..`LS-1112`) trong 28 ngày kèm 78 shipment, 13 trả hàng và 151 sự kiện giao hàng qua đường dịch vụ thật khi DB trống |
| db | Pool `pg`, chạy migration theo thứ tự, lỗi thiếu `DATABASE_URL` thì dừng ngay khi khởi động |

### Lưu bền

Migration SQL viết tay trong `src/db/migrations/`:

- 001: 8 bảng khởi tạo (đơn, workflow instance, audit, phê duyệt, tồn kho và bảng phụ)
- 002: shipments; 003: vehicles; 004: drivers; 005: delivery-events
- 006: channels + `orders.channel_id`; 007: returns
- 008: customers + `orders.customer_id`
- 009: trường đơn (số điện thoại, mốc giao hẹn, tổng tiền) + giá đơn vị trong kho
- 010: assignments + call_logs; 011: restricted_flags
- 012: `bi_recommendations`, `bi_feedback`, `dx_score_snapshots`
- 013: `tickets`
- 014: `files` + `shipments.proof_photo_file_id`

Dữ liệu mẫu: API tự seed khi kho trống gồm 40 SKU, 5 xe, 5 tài xế, 3 kênh,
8 đơn demo (`DH-1001`..`DH-1008`), 112 đơn lịch sử (`LS-1001`..`LS-1112`,
78 shipment, 13 trả hàng, 151 sự kiện giao hàng) và 14 ticket CSKH mẫu
(`YC-018`..`YC-031`, từ `*.seed.json` và `scripts/generate-sample-data.mjs`).

Mỗi mô-đun có interface store và bản cài đặt Postgres riêng; store
trong bộ nhớ chỉ giữ lại cho test đơn vị. Test: 27 suite (`npm test` với
Jest `--experimental-vm-modules`), gồm 26 suite unit/service (375 test)
và 1 suite kiểm thử tích hợp toàn app trên `pg-mem`
(`persistence.integration.spec.ts`, 3 test).
Giới hạn đã biết: lưu nhiều thực thể liên quan là nhiều bước nối tiếp,
không phải 1 giao dịch chung; `persistence.integration.spec.ts` chạy lâu
trên `pg-mem` (~48–57 giây/test, tổng ~165 giây cho cả suite) vì mỗi
`app.init()` nạp lại toàn bộ 112 đơn lịch sử qua đường dịch vụ thật.

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
(`apiFetch`, token lấy từ cookie httpOnly). Khi chưa đăng nhập, các
trang (trừ `/tracking`) chuyển thẳng tới trang đăng nhập Keycloak.

Các màn đã nối API thật (kèm luồng đăng nhập, phân quyền giao diện theo
vai trò và thao tác upload ảnh/giao hàng trên chi tiết đơn & màn tài xế):

| Màn | Đường dẫn | Nguồn API chính |
| --- | --- | --- |
| Đăng nhập | nút trên header | Keycloak PKCE, `lib/auth.ts` |
| Danh sách đơn | /orders | GET /api/orders, POST /api/orders |
| Chi tiết đơn | /orders/[id] | GET /api/orders/:id, chuyển trạng thái, audit |
| Giao hàng | trên trang chi tiết đơn | POST /api/shipments, dispatch/deliver/fail/cancel |
| Hàng đợi duyệt | /approval-queue | GET /api/approvals, approve/reject |
| Theo dõi đơn hàng | /tracking | GET /api/public/tracking, không cần đăng nhập |
| Tài xế | /driver, /driver/[id] | GET /api/shipments theo tài xế đăng nhập, upload ảnh qua `/api/files` |
| Tổng quan | / (trang chủ) | Hiển thị theo vai trò từ `/api/orders`, `approvals`, `audit`, `inventory` |
| Kho | /warehouse | GET /api/inventory + /api/assignments (mục Việc của tôi) |
| Phân tách địa chỉ | /address-split | GET /api/orders + PATCH địa chỉ |
| Quản trị | /admin | GET /api/audit + /api/audit/verify + /api/workflow/definitions |
| Chăm sóc khách hàng | /customer-care | GET/POST `/api/returns`, `/api/assignments`, `/api/call-logs`, `/api/tickets`, `/api/tickets/kpis` |
| Danh sách hạn chế | /restricted-list | GET /api/restricted-flags |
| Phân phối đơn | /distribution | GET /api/assignments + /api/orders |
| BI & DX-Score | /bi-dx-score | GET/POST `/api/bi/forecast`, `anomalies`, `recommendations`, `feedback`, `dx-score` |

`/telesale` không còn là màn riêng, chuyển hướng sang `/customer-care` từ PR #63.
Route proxy `/api/files` và `/api/files/[id]/content` trên web chuyển tiếp upload/tải file tới API storage.

## Hạ tầng và chạy thử

`compose.yaml` chạy 7 dịch vụ. Cổng: APISIX 9080, API 3001, web 3000,
Keycloak 9080 qua APISIX và console quản trị 8081 trên máy local,
SeaweedFS 8333/8888/9333, ClamAV 3310. Biến môi trường bắt buộc xem
`.env.example`; API yêu cầu `DATABASE_URL`, `KEYCLOAK_URL`,
`KEYCLOAK_INTERNAL_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, các
biến `S3_*` và cấu hình kiểm dịch `CLAMAV_*` (`CLAMAV_ENABLED`,
`CLAMAV_REQUIRED`, `CLAMAV_HOST`, `CLAMAV_PORT`).

Chạy API riêng: `cd services/api && npm install && npm run start:dev`
(cổng 3001, `GET /api/health` và `GET /api/public/tracking` là 2
endpoint công khai). Chạy
web riêng: `cd apps/web && npm install && npm run dev` (cổng 3000).

CI (`.github/workflows/ci.yml`): kiểm tra giấy phép REUSE và cú pháp
`docker compose config -q` trên mọi PR và khi push lên main. Chưa có
CI chạy test hay build.

## Chưa có

Những mục này chưa triển khai trong bản `v0.1.0` hoặc thuộc giai đoạn tiếp theo:

- **AI 1 (chuẩn hóa địa chỉ bằng mô hình), AI 2 (cảnh báo trễ) và Ollama thực tế:** mới có lớp BI pilot dùng quy tắc xác định và chuẩn hóa địa chỉ theo bảng địa danh 3 tỉnh; chưa có service Ollama trong `compose.yaml` và chưa chọn mô hình LLM.
- **Tách riêng `apps/driver` và `packages/shared`:** hiện mới có khung `README.md`/`package.json`; màn hình tài xế đang chạy trong `apps/web/app/driver`.
- **CI tự động cho test/build:** `.github/workflows/ci.yml` hiện chỉ chạy `reuse lint` và `docker compose config -q`, chưa chạy `npm test` hay `npm run build`.
- **Phát hành và đồng bộ nhánh `main`:** `CHANGELOG.md` đã chốt `[0.1.0]` trên nhánh chuẩn bị phát hành từ `dev`; cần merge `dev` vào `main`, gắn tag `v0.1.0` và chạy `scripts/make-release.sh v0.1.0` để xuất GitHub Release.
- **Kiểm chứng E2E trình duyệt đầy đủ với cả 7 dịch vụ:** đã kiểm chứng `docker compose up -d --build` khởi động đủ 7 dịch vụ (`postgres`, `seaweedfs`, `clamav` healthy; `api` chạy đủ 14 migration và seed 120 đơn + 14 ticket; `apisix` định tuyến `/api/health`, `/api/public/tracking` và chặn 401 với route bảo vệ; Keycloak trả OIDC discovery; `web` phục vụ SSR cổng 3000), còn kịch bản đăng nhập và thao tác đầu-cuối trên trình duyệt qua mọi màn hình cần chạy kiểm chứng thủ công/E2E riêng.
