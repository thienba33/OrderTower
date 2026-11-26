<!-- SPDX-License-Identifier: Apache-2.0 -->
# GitOps cho observability

Thư mục này là desired state cho Argo CD, tách khỏi compose dùng ở local.

## Thành phần

- `argocd/application.yaml`: Argo CD Application trỏ về `infra/gitops/observability`
  trên nhánh `dev`, tự sync/prune/self-heal.
- `observability/`: Kustomize cho Prometheus + Grafana.
  - Prometheus scrape `ordertower-api.ordertower.svc.cluster.local:3001/api/metrics`.
  - Grafana datasource trỏ Prometheus trong cùng namespace.
  - Dashboard `OrderTower API` được provision sẵn.

## Trước khi sync

Tạo secret mật khẩu Grafana (không commit secret):

```bash
kubectl create namespace ordertower-observability --dry-run=client -o yaml | kubectl apply -f -
kubectl -n ordertower-observability create secret generic grafana-admin \
  --from-literal=password='<mật-khẩu-mạnh>'
```

Nếu API chạy ở namespace/tên service khác, sửa target trong
`observability/prometheus-k8s.yml` trước khi sync.

## Kiểm tra manifest

```bash
kubectl kustomize infra/gitops/observability >/dev/null
```

## Liên hệ với local

Local dùng `compose.yaml` + `infra/observability/` (Prometheus :9090, Grafana
:3002). GitOps/K8s dùng cùng dashboard/datasource nhưng target scrape là
service trong cluster. Không commit mật khẩu; secret do người vận hành tạo.
