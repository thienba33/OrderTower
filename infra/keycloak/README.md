<!-- SPDX-License-Identifier: Apache-2.0 -->
# Keycloak MFA cho OrderTower

Realm `ordertower` dùng TOTP native của Keycloak cho hai vai quản trị:

| Tài khoản | Vai | Bắt buộc OTP |
| --- | --- | --- |
| `demo.admin` | Quản trị viên | Có |
| `demo.manager` | Quản lý | Có |
| Các tài khoản demo khác | Nhân viên/khách | Không, login một bước |

## Demo secret

Chỉ dùng cho môi trường demo/local:

| Tài khoản | TOTP secret (Base32) |
| --- | --- |
| `demo.admin` | `JBSWY3DPEHPK3PXP` |
| `demo.manager` | `GEZDGNBVGY3TQOJQ` |

Thêm secret vào Google Authenticator/FreeOTP bằng “Enter a setup key”, hoặc
dùng đoạn Node sau để lấy mã hiện tại:

```bash
node -e "const {createHmac}=require('crypto');const s='JBSWY3DPEHPK3PXP';const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let b=0,v=0,o=[];for(const c of s){const i=a.indexOf(c);v=(v<<5)|i;b+=5;if(b>=8){o.push((v>>>(b-8))&255);b-=8}}const t=Math.floor(Date.now()/30000),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(t));const h=createHmac('sha1',Buffer.from(o)).update(buf).digest(),off=h[h.length-1]&15;console.log(((h.readUInt32BE(off)&0x7fffffff)%1e6).toString().padStart(6,'0'))"
```

Production phải rotate secret, không dùng secret trong repo.

## Flow

- `browser-mfa`: cookie → username/password → conditional subflow theo client
  role `ordertower-web.admin` và `ordertower-web.manager`.
- Mỗi subflow có:
  - `conditional-user-role` bắt buộc.
  - `auth-otp-form` alternative.
  - `auth-recovery-authn-code-form` alternative.
- Người không thuộc admin/manager không đi qua subflow MFA.

## Recovery codes

Keycloak 26.8 bật required action **Recovery Authentication Codes**. Sau khi
đăng nhập MFA:

1. Mở `http://localhost:9080/realms/ordertower/account/`.
2. **Account security → Signing in → Recovery authentication codes**.
3. Lưu 12 mã; mỗi mã dùng một lần.
4. Ở màn OTP, chọn **Try another way → Recovery authentication code**.

## Realm đã tồn tại

Keycloak chỉ import realm khi realm chưa tồn tại. Với DB Keycloak cũ:

- Cách nhanh để áp dụng đúng seed/flow: xoá riêng database Keycloak rồi restart
  (không ảnh hưởng database đơn hàng `ordertower`):
  ```bash
  docker compose exec -T postgres psql -U ordertower -d postgres \
    -c 'DROP DATABASE keycloak WITH (FORCE);' \
    -c 'CREATE DATABASE keycloak OWNER keycloak;'
  docker compose restart keycloak
  ```
- Hoặc thêm OTP credential/flow thủ công qua Admin Console. File realm JSON là
  nguồn chuẩn cho cài mới.

## Kiểm tra

- `demo.admin` + mật khẩu → màn **One-time code**.
- Mã đúng → vào app; mã sai → `Invalid authenticator code`.
- `demo.warehouse-staff` → vào thẳng, không hỏi OTP.
- Log Keycloak có `LOGIN_ERROR invalid_user_credentials` khi mã sai.
