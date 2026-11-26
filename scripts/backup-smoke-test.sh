#!/usr/bin/env bash
# Smoke test for scripts/backup-db.sh and scripts/restore-drill.sh (no bats needed).
#
#   bash scripts/backup-smoke-test.sh                       retention rule only (no database)
#   SMOKE_DATABASE_URL=... SMOKE_ADMIN_URL=... bash scripts/backup-smoke-test.sh
#       also: a real dump of SMOKE_DATABASE_URL (read-only), a restore drill into a throwaway database named by
#       RESTORE_DRILL_DATABASE (default resort_check_smoke), and a corrupted-dump run that must FAIL.
#
# The source database is only read. Everything the test creates (files, throwaway database) is removed at the end.
set -euo pipefail
cd "$(dirname "$0")/.."

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0
check() { # description, command...
  local what="$1"; shift
  if "$@"; then printf 'ok:   %s\n' "$what"; else printf 'FAIL: %s\n' "$what" >&2; failures=$((failures + 1)); fi
}
exists() { [ -e "$1" ]; }
missing() { [ ! -e "$1" ]; }

# --- 1. retention rule (14 daily, 8 weekly, 12 monthly) ---
dir="$work/prune"
mkdir -p "$dir"
for stamp in 20261126T020000Z 20261126T010000Z 20261125T020000Z 20261110T020000Z 20260905T020000Z 20260901T020000Z 20250101T020000Z; do
  : > "$dir/resort-$stamp.dump"
  : > "$dir/resort-$stamp.dump.sha256"
done
: > "$dir/notes.txt"
: > "$dir/resort-foo.dump"
BACKUP_DIR="$dir" BACKUP_TODAY=20261126 bash scripts/backup-db.sh --prune-only > "$work/prune.log"
check "newest dump of today is kept"            exists "$dir/resort-20261126T020000Z.dump"
check "second dump of the same day is removed"  missing "$dir/resort-20261126T010000Z.dump"
check "its checksum file goes with it"          missing "$dir/resort-20261126T010000Z.dump.sha256"
check "yesterday's dump is kept (daily)"        exists "$dir/resort-20261125T020000Z.dump"
check "a 16-day-old dump is kept (weekly)"      exists "$dir/resort-20261110T020000Z.dump"
check "the newest dump of an old month is kept (monthly)" exists "$dir/resort-20260905T020000Z.dump"
check "the older dump of that month and week is removed" missing "$dir/resort-20260901T020000Z.dump"
check "a dump older than a year is removed"     missing "$dir/resort-20250101T020000Z.dump"
check "files that are not ours are never touched" exists "$dir/notes.txt"
check "a look-alike name is never touched"      exists "$dir/resort-foo.dump"
BACKUP_DIR="$dir" BACKUP_TODAY=20261126 bash scripts/backup-db.sh --prune-only > "$work/prune2.log"
check "pruning twice changes nothing more"      grep -q 'removed 0' "$work/prune2.log"
check "a bad retention value is refused"        bash -c "! BACKUP_KEEP_DAILY=abc BACKUP_DIR='$dir' bash scripts/backup-db.sh --prune-only >/dev/null 2>&1"
check "no database URL: refuses to dump"        bash -c "! env -u BACKUP_DATABASE_URL -u MIGRATION_DATABASE_URL BACKUP_DIR='$work/none' bash scripts/backup-db.sh >/dev/null 2>&1"
check "a required encryption that is unavailable refuses" bash -c "! BACKUP_DATABASE_URL=postgres://u:secretpw@h/db BACKUP_REQUIRE_ENCRYPTION=true BACKUP_ENCRYPT=none BACKUP_DIR='$work/none' PG_DUMP_CMD=true bash scripts/backup-db.sh >/dev/null 2>&1"

# --- 2. real dump and restore drill ---
if [ -n "${SMOKE_DATABASE_URL:-}" ] && [ -n "${SMOKE_ADMIN_URL:-}" ]; then
  export RESTORE_DRILL_DATABASE="${RESTORE_DRILL_DATABASE:-resort_check_smoke}"
  out="$work/backups"
  BACKUP_DATABASE_URL="$SMOKE_DATABASE_URL" BACKUP_DIR="$out" BACKUP_ENCRYPT=none bash scripts/backup-db.sh > "$work/backup.log" 2>&1
  dump=$(find "$out" -name 'resort-*.dump' | head -n 1)
  check "a dump file was written"                 test -s "$dump"
  check "the dump is mode 0600"                   test "$(stat -c %a "$dump" 2>/dev/null || stat -f %Lp "$dump")" = "600"
  check "the directory is mode 0700"              test "$(stat -c %a "$out" 2>/dev/null || stat -f %Lp "$out")" = "700"
  check "a checksum file sits next to it"         test -s "$dump.sha256"
  check "the log holds no password"               bash -c "! grep -q ':[^/@ ]*@' '$work/backup.log'"
  check "an unencrypted dump is warned about"     grep -q 'NOT be encrypted' "$work/backup.log"

  RESTORE_ADMIN_URL="$SMOKE_ADMIN_URL" BACKUP_DIR="$out" bash scripts/restore-drill.sh > "$work/drill.log" 2>&1 || true
  check "the drill passes on a good dump"         grep -q 'RESULT: PASS' "$work/drill.log"
  check "the drill dropped its database"          bash -c "[ \"\$(${PSQL_CMD:-psql} '$SMOKE_ADMIN_URL' -X -A -t -q -c \"SELECT count(*) FROM pg_database WHERE datname = '$RESTORE_DRILL_DATABASE'\")\" = 0 ]"

  head -c 2000 "$dump" > "$work/corrupt.dump"
  cp "$dump.sha256" "$work/corrupt.dump.sha256"
  RESTORE_ADMIN_URL="$SMOKE_ADMIN_URL" bash scripts/restore-drill.sh "$work/corrupt.dump" > "$work/drill-bad.log" 2>&1 && bad=0 || bad=1
  check "the drill FAILS on a corrupted dump"     test "$bad" = 1
  check "and says so"                             grep -q 'RESULT: FAIL' "$work/drill-bad.log"
  check "and still cleans up"                     bash -c "[ \"\$(${PSQL_CMD:-psql} '$SMOKE_ADMIN_URL' -X -A -t -q -c \"SELECT count(*) FROM pg_database WHERE datname = '$RESTORE_DRILL_DATABASE'\")\" = 0 ]"
else
  printf 'skip: dump and restore drill (set SMOKE_DATABASE_URL and SMOKE_ADMIN_URL)\n'
fi

if [ "$failures" -gt 0 ]; then
  printf '%s check(s) failed\n' "$failures" >&2
  exit 1
fi
printf 'all smoke checks passed\n'
