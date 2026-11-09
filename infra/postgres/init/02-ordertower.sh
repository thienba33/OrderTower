#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${ORDERTOWER_DB_PASSWORD:?ORDERTOWER_DB_PASSWORD is required}"

# Safe to rerun on existing volumes; psql quotes the password as a SQL literal.
psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\getenv app_password ORDERTOWER_DB_PASSWORD
BEGIN;
SELECT 'CREATE ROLE ordertower_app LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ordertower_app')
\gexec
ALTER ROLE ordertower_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
REVOKE ALL ON DATABASE ordertower FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE ordertower TO ordertower_app;
REVOKE CONNECT ON DATABASE keycloak FROM PUBLIC;
GRANT CONNECT ON DATABASE keycloak TO keycloak;
COMMIT;

\connect ordertower
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ordertower_app;
COMMIT;
SQL
