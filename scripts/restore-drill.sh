#!/usr/bin/env bash
# Restore drill: proves that the newest backup can really be restored (docs/15, "Restore drill").
#
#   RESTORE_ADMIN_URL=postgres://admin:...@host/postgres BACKUP_DIR=/var/backups/resort bash scripts/restore-drill.sh [dump-file]
#
# Restores the dump into a THROWAWAY database, runs sanity checks, drops the database again and prints PASS/FAIL per
# check and the elapsed time (your measured RTO for the database part). It never touches the source database.
#
# Settings:
#   RESTORE_ADMIN_URL       URL of a role that may CREATE and DROP databases (maintenance database, e.g. .../postgres). Required.
#   BACKUP_DIR              where dumps live (default ./backups). The newest resort-*.dump* is used unless a file is given.
#   RESTORE_DRILL_DATABASE  name of the throwaway database; must match ^resort_(restore|check)_[a-z0-9_]{1,40}$
#                           (default resort_restore_drill_<timestamp>). The script refuses to drop anything else.
#   RESTORE_SOURCE_URL      optional read-only URL of the live database: row counts are compared (a restored table must
#                           not hold MORE rows than the source, and should hold at least half as many).
#   BACKUP_AGE_IDENTITY     age identity file, to decrypt .age dumps.   (gpg uses your keyring.)
#   RESTORE_KEEP_DATABASE=1 do not drop the database at the end (debugging only; drop it by hand).
#   PSQL_CMD, PG_RESTORE_CMD   the client programs (defaults psql, pg_restore).
#
# Exit code: 0 all checks passed (warnings allowed), 1 a check failed.
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
PSQL_CMD="${PSQL_CMD:-psql}"
PG_RESTORE_CMD="${PG_RESTORE_CMD:-pg_restore}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="${RESTORE_MIGRATIONS_DIR:-$SCRIPT_DIR/../apps/api/src/migrations}"

failures=0
warnings=0
created=0
dbname=""
admin_url=""
db_url=""
start=$(date +%s)

log() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }
warn() { printf 'WARN  %s\n' "$*"; warnings=$((warnings + 1)); }

# The same server and credentials, another database name (query string kept).
with_database() {
  printf '%s' "$1" | sed -E "s#^([a-z]+://[^/]*)/[^?]*#\\1/$2#"
}

# Runs one SQL statement against a URL and prints the single value (no headers, no alignment).
sql_value() {
  "$PSQL_CMD" "$1" -X -A -t -q -v ON_ERROR_STOP=1 -c "$2"
}

cleanup() {
  if [ "$created" -eq 1 ] && [ "${RESTORE_KEEP_DATABASE:-0}" != "1" ]; then
    if [[ "$dbname" =~ ^resort_(restore|check)_[a-z0-9_]{1,40}$ ]]; then
      "$PSQL_CMD" "$admin_url" -X -q -c "DROP DATABASE IF EXISTS $dbname WITH (FORCE)" >/dev/null 2>&1 \
        && log "dropped throwaway database $dbname" \
        || printf 'WARNING: could not drop %s: drop it by hand\n' "$dbname" >&2
    fi
  fi
}
trap cleanup EXIT

admin_url="${RESTORE_ADMIN_URL:-}"
[ -n "$admin_url" ] || die "RESTORE_ADMIN_URL is required (a role that can CREATE/DROP DATABASE)"
command -v "$PSQL_CMD" >/dev/null 2>&1 || die "$PSQL_CMD not found"
command -v "$PG_RESTORE_CMD" >/dev/null 2>&1 || die "$PG_RESTORE_CMD not found"

dump="${1:-}"
if [ -z "$dump" ]; then
  dump=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'resort-*.dump*' ! -name '*.sha256' ! -name '*.partial' 2>/dev/null | sort | tail -n 1)
fi
[ -n "$dump" ] && [ -f "$dump" ] || die "no dump found in $BACKUP_DIR (run scripts/backup-db.sh first)"
log "dump: $dump"

dbname="${RESTORE_DRILL_DATABASE:-resort_restore_drill_$(date -u +%Y%m%d%H%M%S)}"
[[ "$dbname" =~ ^resort_(restore|check)_[a-z0-9_]{1,40}$ ]] || die "RESTORE_DRILL_DATABASE must match ^resort_(restore|check)_[a-z0-9_]{1,40}\$"
db_url=$(with_database "$admin_url" "$dbname")

# 1. Integrity of the file itself.
if [ -f "$dump.sha256" ]; then
  expected=$(cut -d' ' -f1 < "$dump.sha256")
  if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$dump" | cut -d' ' -f1); else actual=$(shasum -a 256 "$dump" | cut -d' ' -f1); fi
  if [ "$expected" = "$actual" ]; then pass "checksum matches"; else fail "checksum differs: the file changed after it was written"; fi
else
  warn "no .sha256 next to the dump (cannot prove it is unchanged)"
fi

# 2. Restore into a fresh database. Decrypts on the fly: plaintext never touches the disk.
exists=$(sql_value "$admin_url" "SELECT count(*) FROM pg_database WHERE datname = '$dbname'")
[ "$exists" = "0" ] || die "database $dbname already exists: pick another RESTORE_DRILL_DATABASE or drop it"
"$PSQL_CMD" "$admin_url" -X -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbname" >/dev/null
created=1
log "restoring into throwaway database $dbname ..."
restore_ok=1
case "$dump" in
  *.age)
    [ -n "${BACKUP_AGE_IDENTITY:-}" ] || die "BACKUP_AGE_IDENTITY (identity file) is required to decrypt an .age dump"
    age -d -i "$BACKUP_AGE_IDENTITY" < "$dump" | "$PG_RESTORE_CMD" --no-owner --no-privileges --exit-on-error --dbname="$db_url" >/dev/null || restore_ok=0 ;;
  *.gpg)
    gpg --batch --quiet --decrypt < "$dump" | "$PG_RESTORE_CMD" --no-owner --no-privileges --exit-on-error --dbname="$db_url" >/dev/null || restore_ok=0 ;;
  *)
    "$PG_RESTORE_CMD" --no-owner --no-privileges --exit-on-error --dbname="$db_url" < "$dump" >/dev/null || restore_ok=0 ;;
esac
if [ "$restore_ok" -eq 1 ]; then pass "pg_restore finished without errors"; else fail "pg_restore reported errors"; fi

if [ "$restore_ok" -eq 1 ]; then
  # 3. The tables that matter exist and hold data.
  for table in organizations properties houses inventory_blocks payments refunds audit_log staff_users schema_migrations; do
    present=$(sql_value "$db_url" "SELECT to_regclass('public.$table') IS NOT NULL")
    if [ "$present" = "t" ]; then pass "table $table exists"; else fail "table $table is missing"; fi
  done
  orgs=$(sql_value "$db_url" "SELECT count(*) FROM organizations")
  if [ "$orgs" -ge 1 ]; then pass "organizations holds $orgs row(s)"; else fail "organizations is empty"; fi

  # 4. Migration ledger against the repository.
  latest_db=$(sql_value "$db_url" "SELECT max(id) FROM schema_migrations")
  latest_repo=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '[0-9][0-9][0-9]_*.sql' 2>/dev/null | sed 's#.*/##' | sort | tail -n 1)
  if [ -z "$latest_repo" ]; then warn "migrations folder not found: skipped the ledger comparison"
  elif [ "$latest_db" = "$latest_repo" ]; then pass "migration ledger is current ($latest_db)"
  else warn "migration ledger ends at ${latest_db:-nothing}, the repository at $latest_repo: run npm run migrate after a real restore"; fi

  # 5. Append-only guards came along (migration 032 onwards), and they really refuse.
  has_guards=$(sql_value "$db_url" "SELECT count(*) FROM schema_migrations WHERE id >= '032'")
  if [ "$has_guards" -gt 0 ]; then
    triggers=$(sql_value "$db_url" "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('audit_log_append_only','audit_log_no_truncate','payments_guard','refunds_guard','booking_changes_append_only')")
    if [ "$triggers" = "5" ]; then pass "append-only triggers present (5 of 5)"; else fail "append-only triggers: found $triggers of 5"; fi
    rows=$(sql_value "$db_url" "SELECT count(*) FROM audit_log")
    if [ "$rows" -gt 0 ]; then
      refused=$("$PSQL_CMD" "$db_url" -X -A -t -q -c "BEGIN; DELETE FROM audit_log WHERE id = (SELECT id FROM audit_log LIMIT 1); ROLLBACK;" 2>&1 | grep -c 'append-only' || true)
      if [ "$refused" -ge 1 ]; then pass "audit_log refuses a DELETE (append-only holds)"; else fail "audit_log accepted a DELETE"; fi
    else
      warn "audit_log is empty: the refusal probe was skipped"
    fi
  else
    warn "dump predates migration 032: append-only guards not expected"
  fi

  # 6. No constraint was left unvalidated.
  invalid=$(sql_value "$db_url" "SELECT count(*) FROM pg_constraint WHERE NOT convalidated")
  if [ "$invalid" = "0" ]; then pass "all constraints validated"; else fail "$invalid constraint(s) not validated"; fi

  # 7. Row counts against the live database, when given (a dump can only be older: never bigger).
  if [ -n "${RESTORE_SOURCE_URL:-}" ]; then
    for table in organizations properties houses inventory_blocks payments refunds; do
      restored=$(sql_value "$db_url" "SELECT count(*) FROM $table")
      source_count=$(sql_value "$RESTORE_SOURCE_URL" "SELECT count(*) FROM $table")
      if [ "$restored" -gt "$source_count" ]; then fail "$table: restored $restored > source $source_count"
      elif [ $(( restored * 2 )) -lt "$source_count" ]; then warn "$table: restored $restored is under half of source $source_count (an old dump?)"
      else pass "$table: restored $restored, source $source_count"; fi
    done
  else
    for table in inventory_blocks payments refunds; do
      log "info  $table holds $(sql_value "$db_url" "SELECT count(*) FROM $table") row(s) (set RESTORE_SOURCE_URL to compare with the live database)"
    done
  fi

  # 8. Privacy: erasures made after this backup must be applied again before the restored database serves traffic.
  has_ledger=$(sql_value "$db_url" "SELECT to_regclass('public.privacy_erasure_ledger') IS NOT NULL")
  if [ "$has_ledger" = "t" ]; then
    ledger=$(sql_value "$db_url" "SELECT count(*) FROM privacy_erasure_ledger")
    log "info  erasure ledger holds $ledger entr(ies): after a REAL restore run 'npm run privacy:reapply-erasures -- --apply' (docs/15)"
  else
    warn "no erasure ledger in this dump (older than migration 038)"
  fi
fi

elapsed=$(( $(date +%s) - start ))
log "elapsed: ${elapsed}s (compare with your RTO), warnings: $warnings"
if [ "$failures" -eq 0 ]; then
  log "RESULT: PASS"
else
  log "RESULT: FAIL ($failures check(s) failed)"
  exit 1
fi
