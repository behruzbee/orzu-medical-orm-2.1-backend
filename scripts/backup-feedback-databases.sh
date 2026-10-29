#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${PG_CONTAINER:?Set the private PostgreSQL container name}"
: "${BACKUP_ROOT:?Set a private backup directory}"
: "${REPORTS_ROOT:?Set the reports directory in the persistent volume}"

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/.backup.lock"
flock -n 9 || exit 0
destination="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$destination"

for database in orzu_feedback orzu_legacy_postgres orzu_legacy_feedback_v2 orzu_legacy_mysql; do
  temporary="$destination/$database.dump.partial"
  docker exec "$PG_CONTAINER" pg_dump -U postgres -d "$database" -Fc > "$temporary"
  docker exec -i "$PG_CONTAINER" pg_restore --list < "$temporary" > /dev/null
  mv "$temporary" "$destination/$database.dump"
done

tar -czf "$destination/reports.tar.gz.partial" -C "$REPORTS_ROOT" .
tar -tzf "$destination/reports.tar.gz.partial" > /dev/null
mv "$destination/reports.tar.gz.partial" "$destination/reports.tar.gz"
(
  cd "$destination"
  sha256sum ./*.dump reports.tar.gz > SHA256SUMS
)
touch "$destination/COMPLETE"
printf 'Verified database and report backups: %s\n' "$destination"
