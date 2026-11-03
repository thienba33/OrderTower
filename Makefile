# SPDX-License-Identifier: Apache-2.0
# Các lệnh vận hành dự án.
.PHONY: up down lint release

up:
	docker compose up -d

down:
	docker compose down -v

lint:
	reuse lint

release:
	./scripts/make-release.sh $(VERSION)
