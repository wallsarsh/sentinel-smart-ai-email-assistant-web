#!/usr/bin/env bash
# Writes a verified Postgres backup. Run it from cron / a Kubernetes CronJob; see docs/runbook.md.
#   DATABASE_URL=postgres://... BACKUP_DIR=/backups deploy/backup.sh
# The dump holds only encrypted secrets and wrapped data keys. It is useless without the KEK, which must be
# stored separately (secret manager). Keep dumps encrypted at rest and off the database host.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
dir="${BACKUP_DIR:-./backups}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$dir/sentinel-$stamp.dump"
n=1
while [[ -e "$file" ]]; do # two backups in the same second must not overwrite each other
  n=$((n + 1))
  file="$dir/sentinel-$stamp-$n.dump"
done

pg_dump --format=custom --no-owner --no-privileges --file "$file.partial" "$DATABASE_URL"
# A dump that cannot be listed is not a backup.
pg_restore --list "$file.partial" > /dev/null
mv "$file.partial" "$file"
(cd "$dir" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")

# Retention: dumps older than BACKUP_KEEP_DAYS go, but never the newest one.
newest="$(ls -1 "$dir"/sentinel-*.dump | sort | tail -n 1)"
find "$dir" -maxdepth 1 -name 'sentinel-*.dump*' -mtime +"$keep_days" ! -name "$(basename "$newest")*" -delete

echo "$file"
