<!-- SPDX-License-Identifier: Apache-2.0 -->
# Tenant context và RLS

## Tenant lấy từ đâu

`AuthService` đọc claim `tenant_id` trong access token. Thiếu claim hoặc claim
rỗng thì `TenantContextService` dùng `default`. `TenantContextInterceptor`
giữ tenant trong AsyncLocalStorage suốt request.

Keycloak realm có protocol mapper `tenant-id` lấy từ user attribute
`tenant_id`. User demo không có attribute nên mặc định là `default`; muốn
tenant khác thì gán attribute cho user (hoặc đổi claim qua IdP).

Keycloak 26.8 không nhận block `userProfile` trong file realm import; vì vậy
attribute `tenant_id` cần khai báo qua Admin Console/Admin API ở realm đã tạo.
Thiếu khai báo này thì token không có claim và API dùng tenant `default` —
RLS vẫn hoạt động bình thường.

## Cách DB áp dụng

- `DbService.query` mở transaction ngắn và `set_config('app.tenant_id', ...,
  true)` trước mỗi query khi chạy Postgres thật.
- `DbService.withTransaction` set cùng biến trong transaction nghiệp vụ.
- Migration `017_tenancy_rls` thêm cột `tenant_id` (mặc định `'default'`) cho
  các bảng nghiệp vụ.
- Lúc khởi động, `DbService` tạo trigger gán `tenant_id` từ
  `app.tenant_id`, bật `ENABLE/FORCE ROW LEVEL SECURITY` và policy
  `tenant_isolation` cho các bảng trong `TENANT_RLS_TABLES`.
- pg-mem trong unit test không hỗ trợ RLS nên bỏ phần trigger/policy; cột
  `tenant_id` vẫn có và mặc định `default`.

## Ngoại lệ có chủ đích

- `schema_migrations`, `id_counters`, `workflow_active_versions`: cấu hình
  toàn cục, không có tenant.
- `audit_log`: có `tenant_id` để truy vết nhưng **không bật RLS** vì chuỗi
  hash audit là toàn cục; bật RLS sẽ làm `/api/audit/verify` không đọc được
  toàn bộ chuỗi. API audit vẫn giới hạn theo vai.

## Lưu ý vận hành

RLS bị bỏ qua với superuser/bypassrls. API phải kết nối bằng role thường
(`ordertower_app` trong compose), không dùng role admin `ordertower`.

Kiểm tra nhanh bằng role app:

```sql
SET app.tenant_id = 'tenant-b';
SELECT id, tenant_id FROM orders WHERE tenant_id = 'tenant-b';
```

Nếu không set `app.tenant_id`, policy fallback `default`; dữ liệu tenant khác
không hiện.
