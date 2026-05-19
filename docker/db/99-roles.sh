#!/bin/bash
# Set passwords for Supabase internal roles to match POSTGRES_PASSWORD
# Runs after the built-in supabase/postgres init scripts
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    ALTER USER supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER USER authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER USER supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER USER supabase_replication_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
    ALTER USER supabase_read_only_user WITH PASSWORD '${POSTGRES_PASSWORD}';
EOSQL
