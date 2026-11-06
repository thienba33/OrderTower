<!-- SPDX-License-Identifier: Apache-2.0 -->
# Hạ tầng local

Hướng dẫn chạy PostgreSQL và Keycloak cho môi trường phát triển OrderTower.
Chạy các lệnh bên dưới tại **thư mục gốc dự án**.

## 1. Điền cấu hình

Nếu chưa có `.env`, sao chép `.env.example` thành `.env`:

```bash
cp .env.example .env
```

Điền bốn biến sau trong `.env`:

| Biến | Dùng để làm gì? |
| --- | --- |
| `KEYCLOAK_DB_PASSWORD` | Keycloak kết nối PostgreSQL |
| `KEYCLOAK_ADMIN_USERNAME` | Tên đăng nhập quản trị Keycloak |
| `KEYCLOAK_ADMIN_PASSWORD` | Mật khẩu quản trị Keycloak |
| `ORDERTOWER_DEMO_PASSWORD` | Mật khẩu chung cho bảy tài khoản demo |

Không commit `.env`. Bộ tài khoản demo chỉ dùng cho môi trường local.

## 2. Khởi động

```bash
docker compose up -d postgres keycloak
docker compose ps -a
docker compose logs -f keycloak
```

Lần đầu cần chờ Keycloak tạo bảng và import realm `ordertower`.
Nhấn `Ctrl+C` để thoát phần xem log; container vẫn chạy.

## 3. Đăng nhập và kiểm tra

| Trang | Địa chỉ | Tài khoản |
| --- | --- | --- |
| Quản trị Keycloak | http://localhost:8081/admin/ | Dùng `KEYCLOAK_ADMIN_USERNAME` và `KEYCLOAK_ADMIN_PASSWORD`; chọn realm `ordertower` |
| Hồ sơ cá nhân | http://localhost:8081/realms/ordertower/account/ | Dùng tài khoản demo và `ORDERTOWER_DEMO_PASSWORD` |

Keycloak chỉ mở trên máy chạy Docker (`127.0.0.1:8081`).
Các tài khoản được tạo và gán role khi import lần đầu:

| Tài khoản | Role của OrderTower |
| --- | --- |
| `demo.admin` | `admin` |
| `demo.dispatcher` | `dispatcher` |
| `demo.warehouse-staff` | `warehouse-staff` |
| `demo.customer-service` | `customer-service` |
| `demo.driver` | `driver` |
| `demo.manager` | `manager` |
| `demo.customer` | `customer` |

`demo.admin` là Admin ứng dụng, không có quyền quản trị Keycloak.
Mỗi tài khoản có thêm quyền `account/view-profile` và `account/manage-account`
để sử dụng trang hồ sơ cá nhân.

## 4. Khi thay đổi cấu hình

- **Realm JSON:** chỉ tự import khi realm chưa tồn tại. Nếu đã chạy rồi,
  cập nhật qua Admin Console hoặc Admin API; restart không áp dụng lại JSON.
- **Mật khẩu demo:** đổi biến trong `.env` không tự đổi mật khẩu người dùng
  đã tồn tại. Đổi mật khẩu qua Keycloak.
- **Database:** script khởi tạo chỉ tự chạy khi volume PostgreSQL trống.
  Nếu volume đã tồn tại mà thiếu database `keycloak`, cần tạo bổ sung.

JSON hiện bật đăng ký và quên mật khẩu. Với realm đã tồn tại, bật tại
**Realm settings → Login → User registration / Forgot password**.
Quên mật khẩu cần cấu hình SMTP tại **Realm settings → Email** và email
nhận thư được; địa chỉ demo `@example.test` không nhận thư.
Người tự đăng ký không tự được gán role nghiệp vụ.

Để dừng dịch vụ và giữ dữ liệu:

```bash
docker compose down
```

Không dùng `docker compose down -v` hoặc `make down` nếu muốn giữ dữ liệu;
`make down` hiện có tùy chọn xóa volume.

## Các file cấu hình

| File | Trách nhiệm |
| --- | --- |
| [compose.yaml](../compose.yaml) | Khai báo dịch vụ, kết nối và volume |
| [postgres/init/01-keycloak.sh](postgres/init/01-keycloak.sh) | Tạo database và PostgreSQL user `keycloak`; Keycloak tự tạo bảng |
| [keycloak/realm/ordertower-realm.json](keycloak/realm/ordertower-realm.json) | Khai báo realm, client `ordertower-web`, role và tài khoản demo |
| [apisix/config.yaml](apisix/config.yaml) | Bật APISIX standalone, dùng cấu hình tệp |
| [apisix/apisix.yaml](apisix/apisix.yaml) | Khai báo tuyến Gateway tới API |

Frontend chưa tích hợp đăng nhập; `/auth/callback` trong JSON là callback
dự kiến. Backend chưa thực thi quyền nghiệp vụ và chưa tạo hồ sơ tài xế,
khách hàng tương ứng với tài khoản Keycloak.

## Các dịch vụ trong Compose

| Dịch vụ | Phiên bản | Cổng trên máy |
| --- | --- | --- |
| PostgreSQL | 16 | 5432 |
| Keycloak | 26.8.1 | 8081 |
| Apache APISIX | 3.19.0-debian | 9080, 9180 |
| SeaweedFS (mini, object storage/S3) | 4.51 | 8333, 8888, 9333 |

Lệnh ở bước 2 chỉ khởi động PostgreSQL và Keycloak. Các dịch vụ còn lại
được khai báo trong Compose; bảng này không xác nhận tích hợp đã hoàn tất.
