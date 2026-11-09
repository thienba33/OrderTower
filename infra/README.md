<!-- SPDX-License-Identifier: Apache-2.0 -->
# Hạ tầng local

Hướng dẫn chạy PostgreSQL, Keycloak và APISIX cho môi trường phát triển OrderTower.
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
docker compose up -d postgres keycloak apisix
docker compose ps -a
docker compose logs -f keycloak
```

Lần đầu cần chờ Keycloak tạo bảng và import realm `ordertower`.
Nhấn `Ctrl+C` để thoát phần xem log; container vẫn chạy.

## 3. Đăng nhập và kiểm tra

| Trang | Địa chỉ | Tài khoản |
| --- | --- | --- |
| Quản trị Keycloak | http://localhost:8081/admin/ | Dùng `KEYCLOAK_ADMIN_USERNAME` và `KEYCLOAK_ADMIN_PASSWORD`; chọn realm `ordertower` |
| Hồ sơ cá nhân qua APISIX | http://localhost:9080/realms/ordertower/account/ | Dùng tài khoản demo và `ORDERTOWER_DEMO_PASSWORD` |

Người dùng truy cập Keycloak qua APISIX ở cổng `9080`. Cổng `8081` chỉ
mở trên máy chạy Docker (`127.0.0.1`) để quản trị; `/admin/*` không được
chuyển tiếp qua Gateway. Người có quyền truy cập máy local vẫn có thể
gọi trực tiếp cổng này. Không công khai cổng `8081` khi triển khai.
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

### APISIX và một client Keycloak

Ứng dụng dùng public client `ordertower-web` với PKCE. APISIX nhận Bearer
token trên `/api/*` và xác minh chữ ký bằng JWKS, kiểm tra issuer
`http://localhost:9080/realms/ordertower` cùng audience `ordertower-web`.
Chế độ `bearer_only: true` kết hợp `use_jwks: true` không dùng client
secret. Không cần tạo client `ordertower-api`; đây chỉ là ID của route.

Realm JSON có Audience mapper `ordertower-web-audience`. Với realm đã
tồn tại, thêm mapper qua Admin Console:

1. Chọn realm `ordertower` → Clients → `ordertower-web` → Client scopes.
2. Mở `ordertower-web-dedicated` → Mappers → Configure a new mapper → Audience.
3. Đặt Name là `ordertower-web-audience`, Included Client Audience là
   `ordertower-web`, bật Add to access token và tắt Add to ID token, rồi lưu.

Mapper chỉ ảnh hưởng token cấp mới qua `ordertower-web`. Token của Account
Console có audience `account` không đáp ứng kiểm tra này. Các role nghiệp
vụ vẫn nằm trong `resource_access.ordertower-web.roles` khi có trong token;
backend phải kiểm tra quyền và phạm vi dữ liệu.

### Đăng nhập qua Gateway

| Route | Xử lý |
| --- | --- |
| `/realms/*` | Chuyển tới Keycloak; không yêu cầu token; có `limit-req` và request ID |
| `/resources/*` | CSS, JavaScript, ảnh của Keycloak; tách khỏi quota xác thực |
| `/api/*` | Kiểm tra token trước khi chuyển tới backend `api:3001` |
| `/admin/*`, `/metrics`, `/health` | Không có route public; trả `404` |

Đăng nhập, đăng ký, quên mật khẩu, đổi code lấy token và logout đều dùng
URL `http://localhost:9080/realms/...`. Route `/realms/*` giới hạn theo IP
kết nối: `rate: 5`, `burst: 10`, `nodelay: true`, vượt ngưỡng trả `429`.
Đây là giá trị khởi đầu cho local; cần đo tải trước khi triển khai, nhất
là khi nhiều người dùng chung IP. Giới hạn này không thay thế MFA hay
chống dò mật khẩu của Keycloak.

APISIX ghi đè các header `X-Forwarded-*` trước khi chuyển request. Keycloak
dùng `KC_PROXY_HEADERS=xforwarded`, public hostname `http://localhost:9080`,
admin hostname `http://localhost:8081` và backchannel nội bộ
`http://keycloak:8080`. Discovery nội bộ vẫn công bố issuer public mới.

Để áp dụng thay đổi cho container đang chạy, giữ nguyên database:

```bash
docker compose up -d --no-deps keycloak apisix
docker compose restart apisix
```

Restart APISIX giúp bỏ cache discovery/issuer cũ. Đặt `KEYCLOAK_URL` trong
`.env` thành `http://localhost:9080`, rồi đăng nhập lại để lấy token có
issuer mới. Callback ứng dụng vẫn là `http://localhost:3000/auth/callback`.
Không cần xóa realm hoặc volume.

Kiểm tra nhanh:

```bash
curl -i http://localhost:9080/realms/ordertower/.well-known/openid-configuration
curl -i http://localhost:9080/api/test
docker compose logs -f apisix
```

APISIX đọc `apisix.yaml` ở chế độ standalone; cuối file phải có `#END`.
Request API không có token phải trả `401`. Token hợp lệ hiện đi tới bước
chọn upstream nhưng trả `503` vì backend chưa chạy. Backend NestJS và
callback frontend chưa triển khai; chưa có luồng API end-to-end.

Cấu hình này dành cho local, vẫn dùng HTTP và Keycloak `start-dev`.
Khi public cần HTTPS, cấu hình proxy tin cậy theo mạng triển khai và
đường quản trị riêng. SMTP chưa được cấu hình nên chưa gửi được thư reset.

### Vị trí cấu hình

| File | Trách nhiệm |
| --- | --- |
| [compose.yaml](../compose.yaml) | Khai báo dịch vụ, kết nối và volume |
| [postgres/init/01-keycloak.sh](postgres/init/01-keycloak.sh) | Tạo database và PostgreSQL user `keycloak`; Keycloak tự tạo bảng |
| [keycloak/realm/ordertower-realm.json](keycloak/realm/ordertower-realm.json) | Khai báo realm, client `ordertower-web`, role và tài khoản demo |
| [apisix/config.yaml](apisix/config.yaml) | Bật APISIX standalone, dùng cấu hình tệp |
| [apisix/apisix.yaml](apisix/apisix.yaml) | Route Keycloak, rate limit và xác thực API |

Frontend chưa tích hợp đăng nhập; `/auth/callback` trong JSON là callback
dự kiến. Backend chưa thực thi quyền nghiệp vụ và chưa tạo hồ sơ tài xế,
khách hàng tương ứng với tài khoản Keycloak.

## Các dịch vụ trong Compose

| Dịch vụ | Phiên bản | Cổng trên máy |
| --- | --- | --- |
| PostgreSQL | 16 | 5432 |
| Keycloak | 26.8.1 | 8081, chỉ loopback để quản trị; người dùng qua APISIX |
| Apache APISIX | 3.19.0-debian | 9080 |
| SeaweedFS (mini, object storage/S3) | 4.51 | 8333, 8888, 9333 |

Lệnh ở bước 2 khởi động PostgreSQL, Keycloak và APISIX. Các dịch vụ còn lại
được khai báo trong Compose; bảng này không xác nhận tích hợp đã hoàn tất.
