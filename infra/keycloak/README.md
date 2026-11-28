<!-- SPDX-License-Identifier: Apache-2.0 -->
# Keycloak MFA cho OrderTower

Realm `ordertower` dùng TOTP native của Keycloak cho hai vai quản trị:

| Tài khoản | Vai | Bắt buộc OTP |
| --- | --- | --- |
| `demo.admin` | Quản trị viên | Có |
| `demo.manager` | Quản lý | Có |
| Các tài khoản demo khác | Nhân viên/khách | Không, login một bước |

## Đăng ký OTP lần đầu

1. Đăng nhập `demo.admin` hoặc `demo.manager` bằng mật khẩu demo.
2. Keycloak hiện màn **Configure authenticator** kèm **QR code**.
3. Quét QR bằng Google Authenticator / FreeOTP / Microsoft Authenticator.
4. Nhập mã 6 số để hoàn tất.
5. Lần đăng nhập sau mới hiện ô **One-time code**.

Không có secret cố định trong repo. Secret do Keycloak sinh khi quét QR.

Nếu tài khoản đã có OTP credential cũ và không hiện QR:

- Vào Keycloak Admin Console → realm `ordertower` → Users → chọn user →
  Credentials → xoá `OTP`.
- Thêm required action **Configure OTP**.
- Đăng nhập lại.

Realm JSON không còn seed OTP secret; QR do Keycloak sinh khi đăng ký.

Hoặc xoá riêng database Keycloak để import lại realm sạch (không ảnh hưởng
database đơn hàng `ordertower`):

```bash
docker compose exec -T postgres psql -U ordertower -d postgres \
  -c 'DROP DATABASE keycloak WITH (FORCE);' \
  -c 'CREATE DATABASE keycloak OWNER keycloak;'
docker compose restart keycloak
```

## Flow

- Dùng browser flow mặc định của Keycloak.
- `CONFIGURE_TOTP` là required action của `demo.admin`/`demo.manager`, nên lần
  đăng nhập đầu bắt buộc đăng ký QR trước khi vào app.
- Sau khi có OTP credential, Keycloak tự hỏi OTP ở các lần đăng nhập sau.
- Người không có OTP credential không bị hỏi.

## Recovery codes

Với realm mới, bật thêm một lần trong Keycloak Admin Console:

1. **Authentication → Flows → Browser → Browser - Conditional 2FA**.
2. Đổi **Recovery Authentication Code Form** từ `Disabled` sang `Alternative`.
3. Đăng nhập MFA, mở `http://localhost:9080/realms/ordertower/account/`.
4. **Account security → Signing in → Recovery authentication codes**.
5. Lưu 12 mã; mỗi mã dùng một lần.
6. Ở màn OTP, chọn **Try another way → Recovery authentication code**.

Realm live hiện đã bật form này.

## Production

- Không dùng required action seed hoặc tài khoản demo.
- Bật MFA theo role/group; secret do người dùng tự đăng ký.
- Có thể yêu cầu WebAuthn/passkey thay TOTP.
