<!-- SPDX-License-Identifier: Apache-2.0 -->
# Hạ tầng

| Dịch vụ | Phiên bản | Vai trò | Cổng |
| ------- | --------- | ------- | ---- |
| PostgreSQL | 16 | Cơ sở dữ liệu giao dịch | 5432 |
| Keycloak | 26.8.1 | SSO và MFA | 8081 |
| Apache APISIX | 3.19.0-debian | API Gateway | 9080, 9180 |
| SeaweedFS | 4.51 | Kho đối tượng, cổng S3 | 8333, 8888, 9333 |

Cấu hình APISIX nằm trong `infra/apisix/`: `config.yaml` bật chế độ
standalone, `apisix.yaml` khai báo tuyến tới API. SeaweedFS chạy chế độ
mini. Tệp đính kèm qua kiểm dịch ở cửa ngõ trước khi lưu vào kho đối
tượng, cơ sở dữ liệu chính chỉ lưu tham chiếu và hash.
