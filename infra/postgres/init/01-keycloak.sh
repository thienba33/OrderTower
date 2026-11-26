#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${KEYCLOAK_DB_PASSWORD:?KEYCLOAK_DB_PASSWORD is required}"

# psql quotes the password as a SQL literal; keep it out of command arguments.
psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\getenv keycloak_password KEYCLOAK_DB_PASSWORD
CREATE ROLE keycloak WITH LOGIN PASSWORD :'keycloak_password';
CREATE DATABASE keycloak OWNER keycloak;
SQL
