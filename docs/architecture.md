<!-- SPDX-License-Identifier: Apache-2.0 -->
# Kiến trúc

Bốn nguyên lý thiết kế theo mô hình tham chiếu 7 lớp: tách chức năng theo
vòng đời và tốc độ dữ liệu; hội tụ dữ liệu IT và OT ở mức mô phỏng trạng
thái xe và sự kiện giao hàng; quản trị dữ liệu thế hệ mới có phả hệ và
đóng băng số liệu; Zero-Trust cộng GitOps.

## Ánh xạ 7 lớp tham chiếu

| Lớp | Thành phần trong bản này | Ghi chú |
| --- | ------------------------ | ------- |
| 1. Trải nghiệm | Web Next.js, web tài xế | Không có thành phần khác |
| 2. Biên mạng, an toàn | Keycloak, APISIX | SSO, MFA, JWT, giới hạn tốc độ |
| 3. Tác nghiệp, trạng thái | PostgreSQL, API NestJS | Phân quyền tới cấp dòng |
| 4. Tự động hóa | Mô-đun Workflow trong NestJS, định nghĩa dạng tệp JSON | Docker Compose, GitHub Actions |
| 5. Dữ liệu hội tụ | Outbox trong Postgres, SeaweedFS, audit hash nối chuỗi | Không dùng Redpanda ở MVP |
| 6. Phân tích, trí tuệ | Dashboard tự viết, Ollama tự host | Không dùng Qdrant, PostGIS |
| 7. Quản trị, giám sát | Tìm kiếm toàn văn Postgres, Prometheus, Grafana, log JSON | OpenMetadata thuộc định hướng phát triển |

## Luồng dữ liệu

Đơn vào từ 3 kênh mô phỏng hoặc nhập tay -> Workflow engine -> rào chắn
backend -> dashboard đọc từ kho đọc đóng băng -> lớp BI và DX-Score đọc cùng
log và dữ liệu đóng băng. Ảnh bằng chứng qua kiểm dịch ở cửa ngõ rồi mới
vào kho đối tượng.
