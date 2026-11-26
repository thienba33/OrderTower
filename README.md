<!-- SPDX-License-Identifier: Apache-2.0 -->
<p align="center">
  <img src="apps/web/public/ordertower_logo.png" alt="OrderTower Logo" width="200">
</p>


<p align="center">
  <strong>Nền tảng nguồn mở điều hành đơn hàng và logistics</strong>
</p>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0">
  </a>
  <a href="https://github.com/thienba33/OrderTower">
    <img src="https://img.shields.io/badge/GitHub-OrderTower-black.svg" alt="GitHub">
  </a>
  <a href="CHANGELOG.md">
    <img src="https://img.shields.io/badge/Version-0.1.0-green.svg" alt="Version 0.1.0">
  </a>
  <a href="REUSE.toml">
    <img src="https://img.shields.io/badge/REUSE-compliant-brightgreen.svg" alt="REUSE Compliant">
  </a>
</p>

---

## Mục lục

- [Ý tưởng bài toán](#ý-tưởng-bài-toán)
- [Giải pháp kỹ thuật](#giải-pháp-kỹ-thuật)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Tính năng chính](#tính-năng-chính)
- [Dữ liệu mẫu và Hồ sơ PoF](#dữ-liệu-mẫu-và-hồ-sơ-pof)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cài đặt và chạy thử](#cài-đặt-và-chạy-thử)
- [Tài liệu](#tài-liệu)
- [Đóng góp](#đóng-góp)
- [Giấy phép](#giấy-phép)
- [Liên hệ](#liên-hệ)

---

## Ý tưởng bài toán

### Vấn đề cần giải quyết

Các doanh nghiệp nhỏ và hộ kinh doanh bán hàng đa kênh (vận hành 1 kho hàng và 1 đội xe nhỏ) thường xử lý đơn bằng file rời, tin nhắn riêng và giấy tờ thủ công, dẫn đến:

1. **Đơn trùng lặp và sai địa chỉ**: Tiếp nhận từ nhiều kênh (Chat, Web, Điện thoại) thiếu kiểm tra trùng mã và độ tin cậy địa chỉ giao nhận.
2. **Tồn kho cập nhật chậm**: Khó kiểm soát số tồn khả dụng thực tế sau khi giữ hàng cho các đơn đang xử lý.
3. **Quy trình thiếu thống nhất và khó truy vết**: Không có nhật ký thay đổi bất biến hay cơ chế phê duyệt khi sửa đơn nhạy cảm.
4. **Điều phối thủ công và thiếu minh bạch**: Khách hàng và quản lý khó theo dõi trạng thái giao nhận, tỷ lệ hoàn hàng hay cảnh báo thiếu hàng sớm.

### Đối tượng người dùng

| Vai trò | Nhu cầu vận hành |
|---------|-------------------|
| **Điều phối viên** | Tiếp nhận đơn, chia việc telesale/kho, điều xe, xử lý hoàn tiền |
| **Nhân viên kho** | Theo dõi tồn kho khả dụng theo SKU, đóng gói đơn được phân công |
| **Nhân viên CSKH** | Xác minh địa chỉ, ghi nhận cuộc gọi, quản lý ticket và đề xuất hoàn hàng/hạn chế |
| **Tài xế** | Xem các chuyến giao được phân công cho chính mình, giao/báo thất bại kèm ảnh bằng chứng |
| **Quản lý** | Phê duyệt các điểm nhạy cảm (sửa đơn đóng, hoàn hàng, cờ hạn chế, đề xuất BI), theo dõi DX-Score |
| **Quản trị viên** | Giám sát audit log nối chuỗi hash, định nghĩa luồng workflow và phân quyền |
| **Khách hàng mô phỏng** | Tra cứu tiến độ đơn hàng công khai bằng mã đơn và số điện thoại |

---

## Giải pháp kỹ thuật

### Tổng quan giải pháp

**OrderTower** được thiết kế cho cuộc thi **Olympic Tin học Sinh viên Việt Nam 2026 — Khối Phần mềm nguồn mở** (chủ đề **DX-OS Open-Core**), gồm 2 tầng tách biệt rõ ràng:

- **Tầng 1 — DX-OS Open-Core (Platform Layer):** Lõi nền tảng chạy ngầm cung cấp định danh/SSO/RBAC (Keycloak + `AuthGuard`/`RolesGuard`), API Gateway (Apache APISIX), cơ sở dữ liệu quan hệ (PostgreSQL 16), Workflow engine đọc định nghĩa JSON có phiên bản, Audit log nối chuỗi SHA-256, Phê duyệt dùng chung và Dịch vụ dữ liệu phi cấu trúc (SeaweedFS S3 + quét mã độc ClamAV). Tầng 1 không chứa nghiệp vụ logistics.
- **Tầng 2 — OrderTower Application:** Ứng dụng điều hành đơn hàng theo tiến trình **H → P → D → I** (*Human – Process – Data – Intelligence*): giao diện vận hành theo vai trò, quy trình chuẩn hóa có rào chắn backend, dữ liệu truy vết từ gốc và lớp BI pilot hỗ trợ ra quyết định có con người phê duyệt.

### Điểm nổi bật của giải pháp

| Đặc điểm | Mô tả |
|----------|-------|
| **Workflow định nghĩa bằng tệp** | Engine riêng trong `services/api/src/workflow/` đọc `order-flow.v1.json` (9 trạng thái, 10 chuyển trạng thái), tách khỏi code nghiệp vụ |
| **5 rào chắn & 5 điểm duyệt** | Rào chắn backend kiểm tra trùng mã, tồn kho, độ tin cậy địa chỉ, hướng đóng đơn, phê duyệt sửa đơn đã đóng |
| **Audit log bất biến** | Mọi thao tác quan trọng ghi vào `audit_log` nối chuỗi hash SHA-256 kèm endpoint `/api/audit/verify` kiểm chứng toàn chuỗi |
| **Bảo mật đa lớp** | Đăng nhập PKCE S256 qua Keycloak (token trong cookie `httpOnly`), APISIX gateway và kiểm tra vai trò `@Roles` (`RolesGuard`) ở API |
| **Lưu trữ file kiểm dịch** | Ảnh bằng chứng giao hàng và chứng từ tải qua API lưu trên SeaweedFS S3, quét ClamAV qua giao thức `INSTREAM` |
| **Nguồn mở chuẩn PoF** | Giấy phép Apache 2.0, kiểm tra REUSE/SPDX trong CI, đầy đủ `CHANGELOG.md`, `LICENSES.md` và SBOM CycloneDX 1.7 |

---

## Kiến trúc hệ thống

### Luồng vận hành giữa các thành phần

```text
Trình duyệt ──▶ Apache APISIX (:9080) ──▶ API NestJS (:3001) ──▶ PostgreSQL 16 (:5432)
                     │                         │   │
                     ▼                         │   ├──▶ SeaweedFS S3 (:8333)
               Keycloak (:8080) ◀── JWKS ──────┘   └──▶ ClamAV (:3310, INSTREAM)
                     ▲
                     │ PKCE S256
             Web Next.js (:3000)
```

- **Workflow engine:** Thay vì phụ thuộc Flowable nặng nề, dự án triển khai mô-đun Workflow riêng trong `services/api/src/workflow/`, đọc tệp JSON có phiên bản để kiểm soát chuyển trạng thái hợp lệ và ghi nhận lịch sử/người duyệt; đổi tệp định nghĩa và khởi động lại API là áp dụng luồng mới mà không sửa code nghiệp vụ.
- **Phạm vi bản `v0.1.0`:** Lớp BI (`services/api/src/bi/`) chạy ở mức pilot bằng quy tắc xác định; chuẩn hóa địa chỉ dùng bảng địa danh 3 tỉnh (`address`); các tính năng AI 1/AI 2 dùng mô hình LLM/Ollama và việc tách riêng `apps/driver`, `packages/shared` thuộc giai đoạn phát triển tiếp theo (màn hình tài xế hiện nằm tại `apps/web/app/driver`).

Xem phân tích chi tiết các mô-đun, migration và giới hạn đã biết tại [docs/architecture.md](docs/architecture.md).

---

## Tính năng chính

### Luồng đơn hàng và kho

- Vòng đời đơn **9 trạng thái**: `Mới tạo` → `Đã kiểm tra` → `Chờ kho` → `Đang đóng gói` → `Chờ điều xe` → `Đang giao` → `Đã giao` → `Hoàn` / `Hủy`.
- Tồn kho **40 SKU**, hiển thị tồn khả dụng (tổng tồn trừ lượng đang giữ chỗ cho đơn), chặn chuyển kho khi thiếu hàng.
- Kiểm tra độ tin cậy địa chỉ (ngưỡng tối thiểu 70/100) và quản lý hàng đợi phê duyệt cho các thao tác nhạy cảm.

### Giao nhận, CSKH và tra cứu công khai

- Quản lý **Xe**, **Tài xế** và **Shipment** (5 trạng thái), giới hạn dữ liệu để tài xế chỉ xem và thao tác trên đơn/chuyến của chính mình, hỗ trợ tải ảnh bằng chứng giao hàng (`proofPhotoFileId`).
- Quản lý **Hoàn hàng**, **Phân công telesale/kho**, **Nhật ký cuộc gọi**, **Cờ hạn chế** và **Ticket CSKH** (kèm 4 KPI thời gian thực).
- Trang **Theo dõi đơn hàng** công khai (`/tracking` qua `GET /api/public/tracking`) cho phép tra cứu bằng mã đơn và SĐT mà không lộ dữ liệu nội bộ.

### Lớp BI pilot và DX-Score v1

- Dự báo nhu cầu bán theo SKU và kênh dựa trên lịch sử giao hàng.
- Phát hiện 3 loại bất thường theo ngưỡng đóng băng (tồn kho dưới 7 ngày, tỷ lệ hoàn kênh cao, cầu tăng đột biến), sinh đề xuất hành động kèm số liệu đầu vào để Quản lý duyệt/từ chối và ghi phản hồi kết quả thực tế.
- Tính điểm chuyển đổi số **DX-Score v1** theo 4 trục **H-P-D-I** từ log vận hành thật và lưu snapshot.

---

## Dữ liệu mẫu và Hồ sơ PoF

### Dữ liệu mẫu tự tạo (ẩn danh)

API tự động kiểm tra và nạp dữ liệu mẫu khi bảng còn trống (sinh xác định từ `scripts/generate-sample-data.mjs`):

| Thành phần | Quy mô | Ghi chú |
|------------|--------|---------|
| Kho sản phẩm | 40 SKU | Gồm 11 SKU gốc và 29 SKU mở rộng có giá tham khảo |
| Đơn hàng mẫu | 120 đơn | 8 đơn demo (`DH-1001`..`DH-1008`) + 112 đơn lịch sử (`LS-1001`..`LS-1112`) trong 28 ngày |
| Giao nhận & hoàn | 5 xe, 5 tài xế, 3 kênh | Kèm 78 shipment, 151 sự kiện giao hàng và 13 đơn trả hàng lịch sử |
| Ticket CSKH | 14 ticket | Mẫu đóng băng (`YC-018`..`YC-031`) phục vụ màn Chăm sóc khách hàng |

### Hồ sơ Proof of Freedom (PoF)

- **Giấy phép:** Apache License 2.0 toàn văn tại [LICENSE](LICENSE), bản quyền tại [NOTICE](NOTICE), khai báo SPDX trong mọi tệp mã và kiểm tra bằng `reuse lint` trong CI.
- **SBOM & Phụ thuộc:** Bảng kê khai giấy phép tại [LICENSES.md](LICENSES.md) cùng 2 tệp SBOM CycloneDX 1.7 sinh từ lockfile bằng `@cyclonedx/cyclonedx-npm`: [sbom/api.cyclonedx.json](sbom/api.cyclonedx.json) (491 thành phần) và [sbom/web.cyclonedx.json](sbom/web.cyclonedx.json) (361 thành phần).
- **Phát hành mở:** Theo SemVer, định dạng `.tar.gz` kèm checksum `SHA256SUMS` qua [scripts/make-release.sh](scripts/make-release.sh).

---

## Cấu trúc dự án

```text
OrderTower/
├── apps/
│   ├── web/                       # Next.js 14: điều hành, kho, CSKH, BI/DX-Score, màn tài xế (/driver)
│   └── driver/                    # Khung mở rộng ứng dụng tài xế riêng (chưa tách ở bản 0.1.0)
├── services/
│   └── api/                       # NestJS REST API + Workflow engine
│       └── src/
│           ├── auth/              # Xác thực JWT Keycloak (JWKS) + phân quyền RBAC (RolesGuard)
│           ├── workflow/          # Engine riêng + định nghĩa luồng JSON có phiên bản
│           ├── audit/             # Nhật ký nối chuỗi hash SHA-256 + verify endpoint
│           ├── approvals/         # Luồng phê duyệt dùng chung
│           ├── storage/           # Dịch vụ file dùng chung qua SeaweedFS S3 + ClamAV
│           ├── orders/            # Đơn hàng, rào chắn nghiệp vụ
│           ├── inventory/         # Tồn kho 40 SKU
│           ├── shipments/         # Điều xe, giao nhận, sự kiện giao hàng
│           ├── tickets/           # Ticket CSKH tối thiểu
│           ├── bi/                # Lớp BI pilot + DX-Score v1
│           ├── seed/              # Nạp dữ liệu lịch sử 112 đơn
│           └── db/                # Kết nối Postgres + 14 SQL migrations (001..014)
├── packages/
│   └── shared/                    # Khung kiểu dùng chung (chưa tách ở bản 0.1.0)
├── infra/                         # Cấu hình Keycloak realm, APISIX standalone, Postgres init
├── sbom/                          # CycloneDX SBOM cho API và Web
├── seeds/                         # Dữ liệu mẫu minh họa cũ (API tự seed từ src/**/data/)
├── docs/                          # Kiến trúc (architecture.md), ADR, runbook demo
├── scripts/                       # generate-sample-data.mjs, make-release.sh
├── compose.yaml                   # Hạ tầng 7 dịch vụ Docker Compose
├── Makefile                       # Lệnh vận hành nhanh (up, down, lint, release)
├── CHANGELOG.md                   # Lịch sử phiên bản
├── CONTRIBUTING.md                # Hướng dẫn đóng góp và chuẩn PoF
└── LICENSES.md                    # Bảng kê khai giấy phép thành phần
```

---

## Công nghệ sử dụng

### Backend & Platform (Tầng 1 & API)

| Thành phần | Công nghệ | Phiên bản |
|------------|-----------|-----------|
| **API Framework** | NestJS + TypeScript | 12.4.2 / 5.9.3 |
| **Database** | PostgreSQL (`pg`) | 16 / `8.23.1` |
| **Identity / SSO** | Keycloak + `jose` (JWKS) | 26.8.1 / `6.2.17` |
| **API Gateway** | Apache APISIX (standalone) | 3.19.0-debian |
| **Object Storage** | SeaweedFS (`weed mini`) + `@aws-sdk/client-s3` | 4.51 / `3.1177.0` |
| **Antivirus Scan** | ClamAV (`INSTREAM` TCP :3310) | `stable` |
| **Testing** | Jest (`--experimental-vm-modules`) + `pg-mem` | 30.5.2 |

### Frontend Web (Tầng 2)

| Thành phần | Công nghệ | Phiên bản |
|------------|-----------|-----------|
| **Framework** | Next.js (App Router) | 14.2.35 |
| **UI Library** | React + Lucide Icons | 18.3.1 / 0.454.0 |
| **Language** | TypeScript | 5.6.3 |
| **Styling** | Tailwind CSS | 3.4.17 |

---

## Cài đặt và chạy thử

### Yêu cầu hệ thống

- **Docker** và **Docker Compose**
- **Node.js `>= 22`** và **npm** (khi chạy/kiểm tra riêng không qua Docker)
- **Git**

### 1. Chạy trọn bộ bằng Docker Compose (khuyến nghị)

```bash
git clone https://github.com/thienba33/OrderTower.git
cd OrderTower
cp .env.example .env
```

Mở `.env` và điền các biến bắt buộc trước khi khởi động:
- `POSTGRES_ADMIN_PASSWORD`, `ORDERTOWER_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`
- `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`
- `ORDERTOWER_DEMO_PASSWORD` (mật khẩu cho 7 tài khoản demo `demo.*`)
- Cập nhật mật khẩu tương ứng trong `DATABASE_URL`

Khởi động toàn bộ 7 dịch vụ (`postgres`, `keycloak`, `apisix`, `seaweedfs`, `clamav`, `api`, `web`):

```bash
make up
# hoặc: docker compose up -d
```

> **Lưu ý khi khởi động lần đầu:**
> - `keycloak` cần khoảng 60–90 giây để import realm `ordertower`.
> - `clamav` cần thời gian tải cơ sở dữ liệu chữ ký mã độc. Nếu máy có tài nguyên hạn chế và không muốn chạy ClamAV, có thể đặt `CLAMAV_ENABLED=false` trong `.env`.
> - Dự án build và chạy từ mã nguồn sạch mà không cần sửa thủ công header giấy phép.

### 2. Kiểm tra dịch vụ sau khi khởi động

| Dịch vụ | Địa chỉ | Ghi chú |
|---------|---------|---------|
| **Web điều hành** | http://localhost:3000 | Chuyển hướng đăng nhập Keycloak |
| **Tra cứu đơn công khai** | http://localhost:3000/tracking | Không cần đăng nhập (ví dụ `DH-1001` / `0901234501`) |
| **API Health (trực tiếp)** | http://localhost:3001/api/health | Trả về `{"status":"ok","service":"ordertower-api"}` |
| **API Health (qua APISIX)** | http://localhost:9080/api/health | Kiểm tra routing qua Gateway |
| **Keycloak Admin Console** | http://localhost:8081/admin/ | Chỉ mở trên `127.0.0.1` |

### 3. Chạy phát triển và kiểm thử cục bộ

**Backend (`services/api`):**
```bash
cd services/api
npm install
npm run typecheck
npm run build
npm test
```

**Frontend (`apps/web`):**
```bash
cd apps/web
npm install
npm run typecheck
npm run lint
npm run build
```

**Hạ tầng & Giấy phép (tại gốc repo):**
```bash
docker compose config -q
make lint   # yêu cầu đã cài reuse CLI
```

---

## Tài liệu

- [docs/architecture.md](docs/architecture.md) — Kiến trúc chi tiết, danh sách mô-đun, migration và các màn đã nối API
- [infra/README.md](infra/README.md) — Hướng dẫn chi tiết PostgreSQL, Keycloak và Apache APISIX
- [docs/adr/0001-workflow-engine.md](docs/adr/0001-workflow-engine.md) — Quyết định kiến trúc Workflow engine
- [docs/demo-m2-runbook.md](docs/demo-m2-runbook.md) — Kịch bản chạy thử và tài khoản demo
- [CHANGELOG.md](CHANGELOG.md) — Lịch sử thay đổi phiên bản
- [CONTRIBUTING.md](CONTRIBUTING.md) — Hướng dẫn đóng góp và chuẩn PoF
- [SECURITY.md](SECURITY.md) — Chính sách báo cáo lỗ hổng bảo mật
- [LICENSES.md](LICENSES.md) — Bảng kê khai giấy phép thành phần

---

## Đóng góp

Chúng tôi hoan nghênh mọi đóng góp tuân thủ quy trình truy vết Issue → Branch → Pull Request → Review và chuẩn PoF của dự án. Vui lòng đọc [CONTRIBUTING.md](CONTRIBUTING.md) trước khi bắt đầu.

---

## Giấy phép

Dự án được phát hành theo giấy phép **Apache License, Version 2.0**.

```text
Copyright 2026 BeyondDreams

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

Xem toàn văn giấy phép tại [LICENSE](LICENSE) và thông tin bản quyền tại [NOTICE](NOTICE).

---

## Liên hệ

| Kênh | Liên kết |
|------|----------|
| **Bug Reports & Feature Requests** | [GitHub Issues](https://github.com/thienba33/OrderTower/issues) |
| **Security Advisories** | [SECURITY.md](SECURITY.md) |
| **Repository** | https://github.com/thienba33/OrderTower |

---

<p align="center">
  <strong>OrderTower</strong> — BeyondDreams · DX-OS Open-Core · OLP Tin học Sinh viên Việt Nam 2026
</p>
