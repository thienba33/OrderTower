<!-- SPDX-License-Identifier: Apache-2.0 -->
# Trung tâm điều hành đơn hàng cho doanh nghiệp nhỏ

Bài toán: một doanh nghiệp nhỏ bán hàng đa kênh, có 1 kho và 1 đội xe nhỏ, đang
xử lý đơn hàng bằng file rời, chat riêng và giấy tờ. Đơn bị trùng, địa chỉ sai,
tồn kho cập nhật chậm, chia việc bằng tay, giao hàng trễ mà không ai biết trước.

Giải pháp: một lõi mở chạy ngầm (Tầng 1) cộng một ứng dụng điều hành có giao
diện (Tầng 2). Ứng dụng chạy 1 luồng đơn hàng duy nhất từ tiếp nhận đến giao
hàng, dashboard đọc dữ liệu thật, AI chỉ đề xuất, con người phê duyệt các quyết
định nhạy cảm.

- 1 luồng đơn hàng, 9 trạng thái: Mới tạo, Đã kiểm tra, Chờ kho, Đang đóng gói,
  Chờ điều xe, Đang giao, Đã giao, Hoàn, Hủy.
- 7 vai trò: Quản trị viên, Điều phối viên, Nhân viên kho, Nhân viên chăm sóc
  khách hàng, Tài xế, Quản lý, Khách hàng mô phỏng (kiểm tra quyền ở backend qua
  Keycloak JWT + `RolesGuard`).
- 5 rào chắn ở backend, 5 điểm con người bắt buộc duyệt.
- Phân tích & hỗ trợ quyết định có duyệt tay: chuẩn hóa địa chỉ theo bảng địa
  danh 3 tỉnh và lớp BI pilot (`services/api/src/bi/`, dự báo theo SKU/kênh,
  phát hiện bất thường và đề xuất kèm giải thích theo quy tắc xác định); AI 1/AI 2
  dùng mô hình LLM/Ollama thuộc phạm vi nâng cao chưa bật trong bản `0.1.0`.
- DX-Score v1: đo theo 4 trục H-P-D-I từ log vận hành thật và lưu snapshot.
- Dữ liệu mẫu tự tạo, đã ẩn danh: 1 kho, 40 SKU, 120 đơn (8 đơn demo + 112 đơn
  lịch sử), 5 xe và 5 tài xế mô phỏng, 3 kênh nguồn đơn, 14 ticket CSKH mẫu.

## Workflow engine: mô-đun riêng trong NestJS

Engine là một mô-đun riêng trong `services/api`, tách khỏi code API nghiệp
vụ. Định nghĩa luồng nằm trong tệp có phiên bản ở
`services/api/src/workflow/definitions/` (`order-flow.v1.json`), engine đọc
tệp đó để quyết định chuyển trạng thái được phép, ghi lịch sử, lưu người
duyệt, cho quay lui có kiểm soát và từ chối chuyển trạng thái trái phép kèm lý do.

Bài kiểm tra nghiệm thu: đổi tệp định nghĩa, khởi động lại engine, luồng mới
chạy được mà không sửa code API; thử chuyển trạng thái trái phép và phải bị
từ chối kèm log. (Flowable không được dùng trong MVP do mô-đun tự viết đã đáp
ứng bài kiểm tra nghiệm thu.)

## Cấu trúc repo

```
.
|-- LICENSE, NOTICE, README.md, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md
|-- REUSE.toml, LICENSES.md, Makefile, compose.yaml, .env.example
|-- .github/                 CI, mẫu PR, mẫu Issue
|-- apps/
|   |-- web/                 Next.js: điều hành, CSKH, BI/DX-Score và màn tài xế (/driver)
|   |-- driver/              Khung mở rộng ứng dụng tài xế riêng (chưa tách ở bản 0.1.0)
|-- services/
|   |-- api/                 NestJS: API nghiệp vụ + mô-đun Workflow riêng
|       |-- src/
|           |-- auth/        Xác thực JWT Keycloak + phân quyền RBAC (RolesGuard)
|           |-- workflow/    Engine + định nghĩa luồng dạng tệp có phiên bản
|           |-- orders/      Đơn hàng, rào chắn, audit
|           |-- inventory/   Tồn kho (40 SKU)
|           |-- shipments/   Điều xe, sự kiện giao hàng
|           |-- tickets/     Ticket CSKH tối thiểu
|           |-- bi/          Lớp BI pilot: dự báo, bất thường, đề xuất, DX-Score v1
|           |-- storage/     Dịch vụ file dùng chung qua SeaweedFS S3 + ClamAV
|           |-- seed/        Nạp dữ liệu lịch sử mốc 3 (112 đơn)
|-- packages/
|   |-- shared/              Khung kiểu dùng chung (chưa tách ở bản 0.1.0)
|-- infra/                   Keycloak, APISIX, Postgres init
|-- sbom/                    CycloneDX SBOM cho api và web
|-- seeds/                   Dữ liệu mẫu minh họa cũ (API tự nạp từ src/**/data/)
|-- docs/                    Kiến trúc, ADR
|-- scripts/                 generate-sample-data.mjs, make-release.sh
```

## Chạy thử

```sh
git clone https://github.com/thienba33/OrderTower.git
cd OrderTower
cp .env.example .env
# Điền các biến mật khẩu/tài khoản bắt buộc trong .env (xem bên dưới và infra/README.md)
make up
```

Lưu ý cấu hình `.env` và dịch vụ khi chạy bằng `docker compose up -d`:

- Các biến bắt buộc phải điền trong `.env`: `POSTGRES_ADMIN_PASSWORD`,
  `ORDERTOWER_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_USERNAME`,
  `KEYCLOAK_ADMIN_PASSWORD`, `ORDERTOWER_DEMO_PASSWORD`, và mật khẩu ứng dụng
  tương ứng trong `DATABASE_URL`.
- Hạ tầng chạy 7 dịch vụ (`postgres`, `keycloak`, `apisix`, `seaweedfs`,
  `clamav`, `api`, `web`). Lần đầu khởi động, `keycloak` cần khoảng 60–90 giây
  để import realm và `clamav` cần tải cơ sở dữ liệu chữ ký mã độc. Nếu máy cấu
  hình hạn chế không chạy ClamAV, đặt `CLAMAV_ENABLED=false` trong `.env`.
- Kiểm tra nhanh sau khi khởi động:
  - API health: `http://localhost:3001/api/health` (hoặc qua APISIX: `http://localhost:9080/api/health`)
  - Web điều hành: `http://localhost:3000`
  - Tra cứu đơn công khai: `http://localhost:3000/tracking`

Dự án build và chạy từ mã nguồn qua `docker compose up -d` mà không cần sửa
tệp header bằng tay.

## Hồ sơ PoF

- Giấy phép Apache 2.0, header SPDX trong từng tệp mã, bản sao toàn văn ở
  `LICENSE`, kiểm tra bằng `reuse lint` trong CI.
- Release theo SemVer, định dạng mở `.tar.gz` kèm `SHA256SUMS`
  (xem `scripts/make-release.sh`).
- Bug tracker: GitHub Issues. Changelog: `CHANGELOG.md`.
- Danh sách phụ thuộc và giấy phép: `LICENSES.md`. SBOM CycloneDX 1.7 sinh từ
  lockfile bằng `@cyclonedx/cyclonedx-npm` nằm tại `sbom/api.cyclonedx.json`
  và `sbom/web.cyclonedx.json`.

## Giấy phép

Apache 2.0. Xem `LICENSE`. Giấy phép của từng thư viện xem `LICENSES.md`;
giấy phép mô hình AI kiểm tra riêng theo từng mô hình, giấy phép của Ollama
không đồng nghĩa với giấy phép của mô hình.
