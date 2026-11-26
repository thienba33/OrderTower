# SPDX-License-Identifier: Apache-2.0
# Các lệnh vận hành dự án.
.PHONY: up down lint release backup restore

up:
	docker compose up -d

down:
	docker compose down -v

lint:
	reuse lint

release:
	./scripts/make-release.sh $(VERSION)

backup:
	./scripts/backup-postgres.sh

restore:
	RESTORE_YES=1 ./scripts/restore-postgres.sh $(FILE)
