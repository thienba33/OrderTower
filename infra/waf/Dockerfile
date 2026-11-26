# SPDX-License-Identifier: Apache-2.0
# Caddy + Coraza WAF + OWASP CRS. Build bằng xcaddy vì image Caddy chuẩn
# không kèm module coraza-caddy.
FROM caddy:2.11.4-builder AS builder
# Coraza v2.6 yêu cầu Go >= 1.26; image builder đang dùng Go cũ hơn nên cho
# Go tự tải toolchain phù hợp.
ENV GOTOOLCHAIN=auto
RUN xcaddy build --with github.com/corazawaf/coraza-caddy/v2

FROM caddy:2.11.4
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
