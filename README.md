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
  khách hàng, Tài xế, Quản lý, Khách hàng mô phỏng.
- 5 rào chắn ở backend, 5 điểm con người bắt buộc duyệt.
- 3 tính năng AI có duyệt tay: chuẩn hóa địa chỉ, cảnh báo nguy cơ trễ, lớp BI
  (dự báo theo SKU và kênh, phát hiện bất thường, đề xuất kèm giải thích).
- DX-Score: radar HPDI đo từ log vận hành thật, công thức đóng băng.
- Dữ liệu mẫu tự tạo, đã ẩn danh: 1 kho, khoảng 40 sản phẩm, khoảng 120 đơn,
  5 xe và tài xế mô phỏng, 3 kênh nguồn đơn mô phỏng.

## Workflow engine: mô-đun riêng trong NestJS

Engine là một mô-đun riêng trong `services/api`, tách khỏi code API nghiệp
vụ. Định nghĩa luồng nằm trong tệp có phiên bản ở
`services/api/src/workflow/definitions/`, engine đọc tệp đó để quyết định
chuyển trạng thái được phép, ghi lịch sử, lưu người duyệt, cho quay lui có
kiểm soát và từ chối chuyển trạng thái trái phép kèm lý do.

Bài kiểm tra nghiệm thu: đổi tệp định nghĩa, khởi động lại engine, luồng mới
chạy được mà không sửa code API; thử chuyển trạng thái trái phép và phải bị
từ chối kèm log. Nếu engine không đạt bài kiểm tra này, dự án chuyển sang
Flowable.

## Cấu trúc repo

```
.
|-- LICENSE, NOTICE, README.md, CHANGELOG.md, CONTRIBUTING.md, SECURITY.md
|-- REUSE.toml, LICENSES.md, Makefile, compose.yaml, .env.example
|-- .github/                 CI, mẫu PR, mẫu Issue
|-- apps/
|   |-- web/                 Next.js: điều phối, kho, CSKH, quản lý
|   |-- driver/              Web mobile tối giản cho tài xế
|-- services/
|   |-- api/                 NestJS: API nghiệp vụ + mô-đun Workflow riêng
|       |-- src/
|           |-- workflow/    Engine + định nghĩa luồng dạng tệp có phiên bản
|           |-- orders/      Đơn hàng, rào chắn, audit
|           |-- inventory/   Tồn kho
|           |-- shipments/   Điều xe, sự kiện giao hàng
|           |-- bi/          Lớp BI: dự báo, bất thường, đề xuất
|           |-- dx-score/    DX-Score từ log
|           |-- storage/     Kho đối tượng qua S3
|-- packages/
|   |-- shared/              Kiểu dùng chung
|-- infra/                   Keycloak, APISIX, SeaweedFS
|-- seeds/                   Dữ liệu mẫu tự tạo, đã ẩn danh
|-- docs/                    Kiến trúc, ADR
|-- scripts/                 make-release.sh

```

## Chạy thử

```sh
git clone https://github.com/thienba33/OrderTower.git
cd OrderTower
cp .env.example .env
make up
```

Mở http://localhost:3000 cho web điều hành. Hạ tầng chạy bằng một lệnh
`docker compose up` duy nhất. Dự án build từ mã nguồn mà không cần sửa tệp
header bằng tay.

## Hồ sơ PoF

- Giấy phép Apache 2.0, header SPDX trong từng tệp mã, bản sao toàn văn ở
  `LICENSE`, kiểm tra bằng `reuse lint` trong CI.
- Release theo SemVer, định dạng mở `.tar.gz` kèm `SHA256SUMS`
  (xem `scripts/make-release.sh`).
- Bug tracker: GitHub Issues. Changelog: `CHANGELOG.md`.
- Danh sách phụ thuộc và giấy phép: `LICENSES.md`. SBOM sinh từ lockfile
  khi dự án có dependencies.

## Giấy phép

Apache 2.0. Xem `LICENSE`. Giấy phép của từng thư viện xem `LICENSES.md`;
giấy phép mô hình AI kiểm tra riêng theo từng mô hình, giấy phép của Ollama
không đồng nghĩa với giấy phép của mô hình.
