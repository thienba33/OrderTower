<!-- SPDX-License-Identifier: Apache-2.0 -->
# GitOps app API + web

Kustomize desired state cho Tier 3 OrderTower trên Kubernetes, phục vụ nguyên
lý (iv) Zero-Trust + GitOps. Thư mục này chỉ deploy API và web; các dịch vụ
nền (APISIX, WAF, Keycloak, PostgreSQL, SeaweedFS, OpenBao, ClamAV) do hạ tầng
hoặc compose/Helm khác quản lý.

## Luồng

```text
Browser ──TLS──▶ Ingress
                  ├── /api, /realms, /resources ──▶ APISIX ──▶ WAF ──▶ API
                  └── /                          ──▶ ordertower-web
```

- API chỉ có `ClusterIP`, không có Ingress riêng.
- NetworkPolicy mặc định chặn toàn bộ ingress/egress trong namespace, chỉ mở
  đúng luồng web → APISIX/Keycloak, APISIX → WAF/Keycloak, WAF → API, API →
  PostgreSQL/SeaweedFS/OpenBao/ClamAV/Keycloak.
- Cookie web đặt `COOKIE_SECURE=true` sau TLS ingress.

## Điều kiện trước khi sync

1. Có ingress controller (manifest dùng `ingressClassName: nginx`) và TLS
   secret `ordertower-tls` (cert-manager hoặc tạo tay).
2. Các service nền nằm trong namespace `ordertower` với label
   `app.kubernetes.io/name` tương ứng: `apisix`, `waf`, `keycloak`,
   `postgres`, `seaweedfs`, `openbao`, `clamav`.
3. Secret `ordertower-secrets`:
   ```bash
   kubectl create namespace ordertower --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n ordertower create secret generic ordertower-secrets \
     --from-literal=DATABASE_URL='postgres://ordertower_app:...@postgres:5432/ordertower' \
     --from-literal=S3_ACCESS_KEY='...' \
     --from-literal=S3_SECRET_KEY='...' \
     --from-literal=OPENBAO_TOKEN='...'
   ```
4. Keycloak client `ordertower-web` có redirect URI
   `https://ordertower.local/auth/callback` và web origin
   `https://ordertower.local`; `KC_HOSTNAME` trỏ cùng host.
5. Image API/web đã push:
   ```bash
   docker build -t ghcr.io/thienba33/ordertower-api:0.1.0 services/api
   docker build -t ghcr.io/thienba33/ordertower-web:0.1.0 apps/web
   docker push ghcr.io/thienba33/ordertower-api:0.1.0
   docker push ghcr.io/thienba33/ordertower-web:0.1.0
   ```
   Nếu dùng registry khác, sửa `images` trong `kustomization.yaml`.

## Kiểm tra và sync

```bash
kubectl kustomize infra/gitops/app >/dev/null
kubectl apply -f infra/gitops/argocd/application-app.yaml
```

ArgoCD Application `ordertower-app` trỏ path `infra/gitops/app`, target
`dev`, tự sync/prune/self-heal.

## Bằng chứng Zero-Trust

- `docker compose port api 3001` chỉ trả `127.0.0.1:3001`; client LAN không
  gọi thẳng API được.
- Ingress chỉ route `/api`, `/realms`, `/resources` qua APISIX; không có
  backend trực tiếp tới API.
- `kubectl get networkpolicy -n ordertower` thấy default-deny + các allow.
- Web config `COOKIE_SECURE=true`, `APP_ORIGIN=https://ordertower.local`.
- API/web chạy non-root, read-only root filesystem, drop ALL capabilities,
  seccomp RuntimeDefault.

## Giới hạn

- Compose local vẫn HTTP; TLS chỉ ở ingress/K8s.
- Kustomize không tạo secret thật và không deploy APISIX/WAF/Keycloak/OpenBao.
- PII masking và MFA TOTP thuộc branch `feat/tier1-pii-mfa`.
- ClamAV cần egress riêng nếu bật freshclam; policy hiện chỉ mở ingress.
