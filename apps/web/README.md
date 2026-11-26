<!-- SPDX-License-Identifier: Apache-2.0 -->
# Web điều hành

Giao diện điều hành OrderTower: Next.js + Tailwind CSS, dữ liệu mẫu đóng băng, chưa nối API thật.

## Chạy

```sh
npm install
npm run dev
```

## Cấu trúc

- `app/`: layout khung (sidebar + header) và các màn hình.
- `data/`: dữ liệu mẫu đóng băng cho các màn hình.
- `components/layout/`: Shell, Sidebar, Header.
- `components/ui/`: Table, Pagination, Filter, Modal, Combobox, SearchInput.
- `lib/`: đăng nhập Keycloak và client gọi API (chỉ chạy phía server).

## Đăng nhập và gọi API

App đăng nhập qua Keycloak (Authorization Code + PKCE) và gọi API thật
qua APISIX. Token chỉ nằm trong cookie httpOnly; trình duyệt không bao
giờ thấy token và không gọi API trực tiếp (API không bật CORS).

Biến môi trường (xem `.env.example`, không commit file `.env` thật):

- `KEYCLOAK_URL`: gốc Keycloak, mặc định `http://localhost:9080`.
- `KEYCLOAK_REALM`: realm, mặc định `ordertower`.
- `KEYCLOAK_CLIENT_ID`: client, mặc định `ordertower-web`.
- `API_BASE_URL`: cửa API qua APISIX, mặc định
  `http://localhost:9080/api`.

Luồng đăng nhập: nút "Đăng nhập" ở header (`/api/auth/login`) ->
trang đăng nhập Keycloak -> Keycloak trả về `/auth/callback` với code
-> đổi code lấy token, lưu access/refresh/id token vào cookie httpOnly
-> header hiển thị tài khoản thật. `lib/api.ts` (`apiFetch`) gọi API
kèm Bearer token lấy từ cookie; chưa đăng nhập thì ném lỗi 401 để nơi
gọi tự chuyển hướng đăng nhập.
