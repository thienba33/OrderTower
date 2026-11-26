<!-- SPDX-License-Identifier: Apache-2.0 -->
# Hướng dẫn đóng góp cho OrderTower

Cảm ơn bạn đã quan tâm và đóng góp cho **OrderTower** — nền tảng nguồn mở điều hành đơn hàng và logistics 

Quy trình trong tài liệu này là bắt buộc: lịch sử phát triển và tính minh bạch mã nguồn là một phần của tiêu chí đánh giá Proof of Freedom (PoF), mọi thay đổi phải truy vết được từ Issue đến Pull Request và commit.

## Mục lục

- [Nguyên tắc chung và chuẩn PoF](#nguyên-tắc-chung-và-chuẩn-pof)
- [Bắt đầu](#bắt-đầu)
- [Ranh giới kiến trúc Tầng 1 và Tầng 2](#ranh-giới-kiến-trúc-tầng-1-và-tầng-2)
- [Quy trình phát triển](#quy-trình-phát-triển)
- [Chuẩn code và Header giấy phép](#chuẩn-code-và-header-giấy-phép)
- [Quy tắc commit](#quy-tắc-commit)
- [Quy trình Pull Request](#quy-trình-pull-request)
- [Báo cáo lỗi, đề xuất tính năng và bảo mật](#báo-cáo-lỗi-đề-xuất-tính-năng-và-bảo-mật)
- [Tài liệu và hồ sơ phát hành](#tài-liệu-và-hồ-sơ-phát-hành)
- [Giấy phép](#giấy-phép)

## Nguyên tắc chung

- Mỗi thành viên hoặc người đóng góp sử dụng tài khoản GitHub thật của chính mình, không commit hộ người khác.
- Không tạo star, issue, review hoặc pull request giả.
- Không commit `.env`, private key, token hoặc mật khẩu thật dưới bất kỳ hình thức nào; `.env.example` chỉ chứa giá trị mẫu.
- Dữ liệu mẫu phải do đội tự tạo và đã ẩn danh (`seeds/`, `services/api/src/**/data/`), tuyệt đối không sử dụng dữ liệu cá nhân hay dữ liệu doanh nghiệp thật.
- Không chỉnh sửa trực tiếp mã nguồn thư viện bên thứ ba. Không đưa vào dự án thư viện có giấy phép chưa được kiểm chứng OSI-approved hoặc xung đột với Apache 2.0 (như GPL/AGPL trong mã ứng dụng/lõi).

## Bắt đầu

### Yêu cầu công cụ

- **Docker** và **Docker Compose** (để chạy trọn bộ hạ tầng: PostgreSQL 16, Keycloak 26.8.1, Apache APISIX 3.19.0-debian, SeaweedFS 4.51, ClamAV, `api` và `web`).
- **Node.js `>= 22`** và **npm** (theo yêu cầu `engines` của `services/api` và `apps/web`).
- **Git** và (tùy chọn) **GitHub CLI (`gh`)**.
- **REUSE CLI** (`pip install reuse`) nếu muốn chạy kiểm tra header giấy phép trên máy local.

### Thiết lập môi trường phát triển

1. Clone repository (hoặc fork nếu đóng góp từ bên ngoài):

   ```bash
   git clone https://github.com/thienba33/OrderTower.git
   cd OrderTower
   ```

2. Tạo tệp cấu hình môi trường từ mẫu:

   ```bash
   cp .env.example .env
   ```

   Điền các biến bắt buộc trong `.env` (`POSTGRES_ADMIN_PASSWORD`, `ORDERTOWER_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, `ORDERTOWER_DEMO_PASSWORD`, `DATABASE_URL`, `S3_*`, v.v.). Xem chi tiết trong [README.md](README.md) và [infra/README.md](infra/README.md).

3. Khởi động toàn bộ hệ thống bằng Docker Compose:

   ```bash
   make up
   # hoặc: docker compose up -d
   ```

4. Hoặc chạy riêng từng ứng dụng khi phát triển:

   **Backend API (`services/api`):**
   ```bash
   cd services/api
   npm install
   npm run start:dev
   ```

   **Frontend Web (`apps/web`):**
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

## Ranh giới kiến trúc Tầng 1 và Tầng 2

Khi thêm tính năng hoặc refactor, cần giữ đúng phân tách 2 tầng:

- **Tầng 1 — DX-OS Open-Core (Platform Layer):** định danh/SSO/RBAC (Keycloak + `auth`), cổng API (APISIX), cơ sở dữ liệu & migration (`db`), workflow engine đọc định nghĩa JSON có phiên bản (`workflow`), audit log nối chuỗi hash SHA-256 (`audit`), phê duyệt dùng chung (`approvals`), lưu trữ dữ liệu phi cấu trúc (`storage` qua SeaweedFS S3 và ClamAV). **Không đặt nghiệp vụ đơn hàng, tồn kho hay logistics vào Tầng 1.**
- **Tầng 2 — OrderTower Application:** ứng dụng nghiệp vụ trên web (`apps/web`) và các mô-đun nghiệp vụ (`orders`, `inventory`, `shipments`, `vehicles`, `drivers`, `delivery-events`, `channels`, `customers`, `returns`, `assignments`, `restricted-flags`, `public-tracking`, `tickets`, `bi`).

Xem thêm trong [docs/architecture.md](docs/architecture.md).

## Quy trình phát triển

### Tạo Issue và Branch

1. Mọi thay đổi bắt đầu từ một **Issue** trên GitHub Issues (gắn milestone theo mốc phát triển).
2. Đồng bộ nhánh nguồn mới nhất (nhánh tích hợp `dev` hoặc `main` tùy phạm vi việc) trước khi tách nhánh.
3. Tạo branch mới theo quy chuẩn:

   ```text
   <type>/<scope>-<short-description>
   ```

   Ví dụ:
   ```bash
   git checkout -b feat/web-order-kanban
   git checkout -b fix/api-order-validation
   git checkout -b docs/update-architecture
   ```

   Các tiền tố hợp lệ: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`, `ci/`, `perf/`. Tên nhánh dùng chữ thường, dấu gạch ngang, không dùng khoảng trắng hoặc tiếng Việt có dấu. **Không phát triển tính năng trực tiếp trên `main`.**

### Thực hiện và kiểm tra thay đổi

Trước khi đẩy code lên GitHub, chạy các kiểm tra tương ứng với phạm vi thay đổi:

**Backend (`services/api`):**
```bash
cd services/api
npm run typecheck
npm run build
npm test
```

**Frontend (`apps/web`):**
```bash
cd apps/web
npm run typecheck
npm run lint
npm run build
```

**Hạ tầng và giấy phép (tại thư mục gốc repo):**
```bash
docker compose config -q
make lint   # chạy reuse lint nếu đã cài reuse
```

## Chuẩn code và Header giấy phép

### Chuẩn code TypeScript (API & Web)

- Giữ `strictNullChecks`, `noImplicitAny` (`services/api`) và `strict` TypeScript (`apps/web`); không bỏ qua lỗi type bằng `any` hoặc `@ts-ignore` khi chưa có lý do chính đáng.
- Tôn trọng rào chắn nghiệp vụ và kiểm tra quyền (`AuthGuard`, `RolesGuard`, `@Roles`) ở backend — không chỉ chặn ở giao diện.
- Không sửa tay các tệp snapshot/seed được sinh tự động (ví dụ dữ liệu sinh từ `scripts/generate-sample-data.mjs`).
- Giữ mô-đun rõ ràng, viết unit/integration test cho logic nghiệp vụ, rào chắn, phân quyền và xử lý lỗi mới.

### Header giấy phép (SPDX / REUSE)

Mọi tệp mã nguồn và tài liệu mới phải có header SPDX ở dòng đầu để vượt qua kiểm tra `reuse lint` trong CI (`.github/workflows/ci.yml`):

- **TypeScript / JavaScript:**
  ```ts
  // SPDX-License-Identifier: Apache-2.0
  ```
- **Shell / YAML / Dockerfile / Makefile:**
  ```sh
  # SPDX-License-Identifier: Apache-2.0
  ```
- **Markdown:**
  ```markdown
  <!-- SPDX-License-Identifier: Apache-2.0 -->
  ```
- **SQL migration:**
  ```sql
  -- SPDX-License-Identifier: Apache-2.0
  ```

## Quy tắc commit

Dự án áp dụng **Conventional Commits**:

```text
<type>(<scope>): <description>
```

- **Các loại (`type`):** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `build`.
- **Phạm vi (`scope`) phổ biến:** `api`, `web`, `workflow`, `orders`, `inventory`, `shipments`, `bi`, `storage`, `auth`, `seed`, `infra`, `docs`, `ci`, `deps`.
- **Quy tắc:**
  - Mỗi commit tập trung vào một thay đổi logic, message tiếng Anh ngắn gọn, mô tả chính xác việc đã làm.
  - Không dùng message chung chung như `update`, `fix code`, `done`, `final`.
  - Với thay đổi không tương thích ngược, khai báo `!` hoặc mục `BREAKING CHANGE:` theo chuẩn Conventional Commits.

Ví dụ:
```text
feat(storage): add file upload service with ClamAV scan
fix(auth): enforce role guard on driver shipments endpoint
docs(readme): update environment setup for ClamAV and S3
```

## Quy trình Pull Request

### Trước khi mở Pull Request

1. Đảm bảo các lệnh `typecheck`, `lint`, `build`, `test` và `docker compose config -q` đều chạy thành công.
2. Kiểm tra mọi tệp mới đều có header SPDX.
3. Cập nhật tài liệu liên quan (`README.md`, `CHANGELOG.md`, `docs/architecture.md`, `LICENSES.md`, `sbom/`) nếu có thay đổi chức năng, cấu hình hoặc dependency.

### Mở và Review Pull Request

1. Push branch lên GitHub và mở Pull Request theo mẫu trong [.github/pull_request_template.md](.github/pull_request_template.md).
2. Điền đầy đủ:
   - Liên kết Issue: `Closes #<số-issue>`.
   - Tóm tắt thay đổi và các ảnh hưởng tới API contract, DB migration, workflow hoặc `.env` (nếu có).
   - Checklist tự kiểm tra đã tick đầy đủ.
3. Tiêu đề PR tuân theo Conventional Commits (ví dụ: `feat(web): wire BI and DX-Score screen to real BI API`).
4. **Quy tắc merge:**
   - Nhánh `main` được bảo vệ: cấm push trực tiếp, cấm force-push, không tự viết lại lịch sử `main`.
   - Người tạo PR không tự duyệt PR của mình; bắt buộc có **ít nhất 1 approval** từ thành viên khác và toàn bộ CI checks đều xanh.
   - Chiến lược merge mặc định: **Squash and merge** (giữ lịch sử gọn và dễ truy vết). Xóa branch sau khi merge.

## Báo cáo lỗi, đề xuất tính năng và bảo mật

- **Báo lỗi:** Tạo Issue bằng mẫu [.github/ISSUE_TEMPLATE/bug_report.md](.github/ISSUE_TEMPLATE/bug_report.md), kèm bước tái hiện, hành vi mong đợi/thực tế, lệnh chạy và trình duyệt.
- **Đề xuất tính năng:** Tạo Issue bằng mẫu [.github/ISSUE_TEMPLATE/feature_request.md](.github/ISSUE_TEMPLATE/feature_request.md), nêu rõ bài toán, giải pháp và phần ngoài phạm vi MVP (nếu có).
- **Lỗ hổng bảo mật:** Thực hiện theo [SECURITY.md](SECURITY.md) — báo cáo riêng qua **GitHub Security Advisories**, không đăng chi tiết lỗ hổng hoặc kèm secret/dữ liệu nhạy cảm lên Issue công khai.

## Tài liệu và hồ sơ phát hành

- Khi thêm hoặc nâng cấp thư viện trong `services/api` hoặc `apps/web`, phải kiểm tra tính tương thích giấy phép với Apache 2.0, cập nhật bảng trong [LICENSES.md](LICENSES.md) và tái tạo SBOM CycloneDX trong `sbom/` bằng `@cyclonedx/cyclonedx-npm`.
- Khi chuẩn bị phát hành phiên bản mới theo SemVer (`MAJOR.MINOR.PATCH`), cần chốt mục phiên bản trong [CHANGELOG.md](CHANGELOG.md), cập nhật tài liệu kiến trúc/triển khai, gắn Git tag trên `main` và đóng gói bằng `scripts/make-release.sh` (`.tar.gz` kèm `SHA256SUMS`).

## Giấy phép

OrderTower được phát hành theo giấy phép **Apache License 2.0**. Xem toàn văn trong [LICENSE](LICENSE) và thông tin bản quyền tại [NOTICE](NOTICE). Bằng việc gửi đóng góp vào repository này, bạn đồng ý rằng đóng góp của mình sẽ được cấp phép theo Apache License 2.0.
