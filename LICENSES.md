<!-- SPDX-License-Identifier: Apache-2.0 -->
# Bảng kê khai giấy phép

Giấy phép của từng thành phần dùng trong dự án. Giấy phép của Ollama không
đồng nghĩa với giấy phép của mô hình, mỗi mô hình kiểm tra riêng.

| Thành phần | Phiên bản | Giấy phép | Ghi chú |
| ---------- | --------- | --------- | ------- |
| Keycloak | 26.8.1 | Apache 2.0 | SSO và MFA |
| Apache APISIX | 3.19.0-debian | Apache 2.0 | API Gateway |
| PostgreSQL | 16 | PostgreSQL License | Cơ sở dữ liệu giao dịch |
| SeaweedFS | 4.51 | Apache 2.0 | Kho đối tượng, chế độ mini |
| Ollama | Chưa xác định | MIT | Chỉ engine, mô hình kiểm tra riêng; chưa có service trong Compose, chưa chọn mô hình |
| Next.js | 14.2.35 | MIT | Web điều hành |
| React | 18.3.1 | MIT | Giao diện web |
| lucide-react | 0.454.0 | ISC | Icon giao diện |
| NestJS | 12.4.2 | MIT | API dịch vụ |
| Tailwind CSS | 3.4.17 | MIT | Giao diện |
| jose | 6.2.17 | MIT | Xác thực JWT Keycloak (API) |
| pg | 8.23.1 | MIT | Truy cập Postgres (API) |
| reflect-metadata | 0.2.2 | Apache-2.0 | Decorator NestJS (API) |
| rxjs | 7.8.2 | Apache-2.0 | Luồng bất đồng bộ NestJS (API) |

Không dùng trong MVP: MinIO Community (AGPLv3), Qdrant, PostGIS, n8n,
Bitwarden, Odoo, Zammad.

SBOM (CycloneDX 1.7) sinh từ lockfile bằng @cyclonedx/cyclonedx-npm:
`sbom/api.cyclonedx.json` (services/api, 456 thành phần) và
`sbom/web.cyclonedx.json` (apps/web, 358 thành phần). Mỗi tệp gồm cả
dependencies dùng khi chạy và dependencies chỉ dùng khi phát triển.
