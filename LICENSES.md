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
| Ollama | Chưa xác định | MIT | Chỉ engine, mô hình kiểm tra riêng |
| Next.js | Chưa xác định | MIT | Web điều hành |
| NestJS | Chưa xác định | MIT | API dịch vụ |
| Tailwind CSS | Chưa xác định | MIT | Giao diện |

Không dùng trong MVP: MinIO Community (AGPLv3), Qdrant, PostGIS, n8n,
Bitwarden, Odoo, Zammad.

SBOM được sinh từ lockfile khi dự án có dependencies.
