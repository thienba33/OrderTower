<!-- SPDX-License-Identifier: Apache-2.0 -->
# API dịch vụ (NestJS)

Các mô-đun: auth (qua Keycloak), orders (đơn hàng, rào chắn, audit),
inventory (tồn kho), shipments (điều xe, sự kiện giao hàng), bi (lớp BI),
dx-score (DX-Score từ log), storage (kho đối tượng qua S3), workflow
(engine riêng, xem `src/workflow/README.md`).

Mọi chuyển trạng thái đơn hàng đều đi qua mô-đun workflow. Câu điều kiện
trong API nghiệp vụ không được tính là Workflow engine.

Dependencies và phiên bản được khai báo trong `package.json` khi triển khai
từng mô-đun.
