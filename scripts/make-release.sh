#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Tạo release dạng mở: tệp .tar.gz kèm SHA256SUMS từ tag git.
# Cách dùng: ./scripts/make-release.sh v0.1.0
set -euo pipefail
VERSION="${1:?Cách dùng: ./scripts/make-release.sh v0.1.0}"
mkdir -p dist
git archive --format=tar.gz --prefix="ordertower-${VERSION}/" -o "dist/ordertower-${VERSION}.tar.gz" "${VERSION}"
(cd dist && sha256sum "ordertower-${VERSION}.tar.gz" > "ordertower-${VERSION}.SHA256SUMS")
echo "Đã tạo: dist/ordertower-${VERSION}.tar.gz"
