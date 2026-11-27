<!-- SPDX-License-Identifier: Apache-2.0 -->
# Coraza WAF

`waf` là Caddy + Coraza + OWASP CRS, đặt giữa APISIX và API:

```text
client -> APISIX :9080 (OIDC, rate limit) -> waf:8080 (Coraza) -> api:3001
```

APISIX 3.19 không có plugin Coraza; service này là reverse proxy WAF độc lập.
`/healthz` trả 200, các request bị CRS chặn trả 403 kèm thông báo rule.

## Build/run

```bash
docker compose up -d --build waf apisix api
```

Lần đầu build Caddy + CRS có thể mất vài phút vì tải Go module.

## Test

Request hợp lệ qua APISIX vẫn 200. Payload SQLi/XSS mẫu bị 403:

```bash
curl -i "http://localhost:9080/api/public/tracking?orderId=DH-1001%27%20OR%201=1--"
```

WAF log JSON ra stdout của container `waf`; rule vi phạm nằm trong
`http.error.message`. Chỉnh rule/tuning trong `Caddyfile` (`SecRuleEngine`,
`SecRuleUpdateTargetById`, ...) khi có false positive.

## Phạm vi

WAF bảo vệ API và public tracking. Route health đi thẳng API để healthcheck
không phụ thuộc WAF. Keycloak/login không đi qua WAF; APISIX vẫn bảo vệ bằng
rate limit và OIDC.
