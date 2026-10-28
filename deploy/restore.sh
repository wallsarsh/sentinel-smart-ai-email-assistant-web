#!/usr/bin/env bash
# Restores a backup into an EXISTING, empty-or-disposable database. It never picks a target for you.
#   CONFIRM_RESTORE=<database name> deploy/restore.sh <dump file> <target database url>
# CONFIRM_RESTORE must equal the target's database name, so a pasted production URL cannot be restored over by accident.
# Stop web and worker first (docs/runbook.md); the restore replaces every table in the target.
set -euo pipefail

dump="${1:?usage: restore.sh <dump file> <target database url>}"
target="${2:?usage: restore.sh <dump file> <target database url>}"
name="$(psql "$target" -Atc 'select current_database()')"

if [[ "${CONFIRM_RESTORE:-}" != "$name" ]]; then
  echo "refusing: set CONFIRM_RESTORE=$name to restore into database \"$name\"" >&2
  exit 2
fi
if [[ -f "$dump.sha256" ]]; then
  (cd "$(dirname "$dump")" && sha256sum -c "$(basename "$dump").sha256") >&2
fi

pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$target" "$dump"

tables="$(psql "$target" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")"
migrations="$(psql "$target" -Atc "select count(*) from drizzle.__drizzle_migrations")"
echo "restored into $name: $tables tables, $migrations migrations recorded"
