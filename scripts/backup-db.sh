#!/usr/bin/env bash
# Nightly logical backup of the resort database (docs/15, "Backups and disaster recovery").
#
#   BACKUP_DATABASE_URL=postgres://resort_owner:...@host/db BACKUP_DIR=/var/backups/resort bash scripts/backup-db.sh
#   bash scripts/backup-db.sh --prune-only      only apply the retention rule to BACKUP_DIR
#   bash scripts/backup-db.sh --help
#
# What it does: pg_dump in custom format (compressed, restorable table by table) -> optional encryption -> checksum ->
# pruning of OLD LOCAL dumps by a grandfather-father-son rule (default 14 daily + 8 weekly + 12 monthly).
#
# Settings (environment; nothing is read from a file, nothing is printed that contains a password):
#   BACKUP_DATABASE_URL    connection URL of the OWNER role (falls back to MIGRATION_DATABASE_URL). Required.
#   BACKUP_DIR             where dumps go (default ./backups; created 0700). Keep it OUTSIDE the repository.
#   BACKUP_ENCRYPT         auto (default) | age | gpg | none. auto = age if BACKUP_AGE_RECIPIENT is set and `age` exists,
#                          else gpg if BACKUP_GPG_RECIPIENT is set and `gpg` exists, else none with a loud warning.
#   BACKUP_AGE_RECIPIENT   age public key (age1...) or recipients file.   BACKUP_GPG_RECIPIENT  gpg key id or email.
#   BACKUP_REQUIRE_ENCRYPTION=true   refuse to write a plain dump (use this in production).
#   BACKUP_KEEP_DAILY / BACKUP_KEEP_WEEKLY / BACKUP_KEEP_MONTHLY   retention counts (14 / 8 / 12).
#   BACKUP_PRUNE_DRY_RUN=1  show what pruning would delete.   BACKUP_TODAY=YYYYMMDD  override "today" (tests).
#   PG_DUMP_CMD, PG_RESTORE_CMD   the client programs (defaults pg_dump, pg_restore).
#
# The dump holds guest personal data and the IBAN: it is created with mode 0600 inside a 0700 directory, and with
# encryption the plaintext never touches the disk (the dump is piped straight into age or gpg).
# Password hygiene: a password inside the URL is visible in the process list on a shared host. Prefer a URL without a
# password plus PGPASSFILE (or PGPASSWORD in the environment of the cron job).
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-12}"
PG_DUMP_CMD="${PG_DUMP_CMD:-pg_dump}"
PG_RESTORE_CMD="${PG_RESTORE_CMD:-pg_restore}"

log() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
}

# Days since 1970-01-01 for a calendar date (pure bash arithmetic: no GNU/BSD date differences).
days_from_ymd() {
  local y=$1 m=$((10#$2)) d=$((10#$3))
  if [ "$m" -le 2 ]; then y=$((y - 1)); fi
  local era=$(( (y >= 0 ? y : y - 399) / 400 ))
  local yoe=$(( y - era * 400 ))
  local mp=$(( (m + 9) % 12 ))
  local doy=$(( (153 * mp + 2) / 5 + d - 1 ))
  local doe=$(( yoe * 365 + yoe / 4 - yoe / 100 + doy ))
  printf '%s' $(( era * 146097 + doe - 719468 ))
}

require_count() {
  case "$2" in
    ''|*[!0-9]*) die "$1 must be a whole number (got '$2')" ;;
  esac
}

# Grandfather-father-son: keep the newest dump of each of the last N days, N weeks and N months, delete the rest.
prune() {
  require_count BACKUP_KEEP_DAILY "$KEEP_DAILY"
  require_count BACKUP_KEEP_WEEKLY "$KEEP_WEEKLY"
  require_count BACKUP_KEEP_MONTHLY "$KEEP_MONTHLY"
  local today="${BACKUP_TODAY:-$(date -u +%Y%m%d)}"
  local today_days
  today_days=$(days_from_ymd "${today:0:4}" "${today:4:2}" "${today:6:2}")
  local seen_day=" " seen_week=" " seen_month=" " kept=0 removed=0 first=1
  local file base stamp days age week month keep
  # Newest first (the names sort by time). Only files that look like our dumps are ever touched.
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    base=$(basename "$file")
    if ! [[ "$base" =~ ^resort-([0-9]{8})T[0-9]{6}Z\.dump(\.age|\.gpg)?$ ]]; then
      continue
    fi
    stamp="${BASH_REMATCH[1]}"
    days=$(days_from_ymd "${stamp:0:4}" "${stamp:4:2}" "${stamp:6:2}")
    age=$(( today_days - days ))
    if [ "$age" -lt 0 ]; then age=0; fi
    week=$(( (days + 3) / 7 ))
    month="${stamp:0:6}"
    keep=0
    if [ "$first" -eq 1 ]; then keep=1; first=0; fi
    if [ "$age" -lt "$KEEP_DAILY" ] && [[ "$seen_day" != *" $stamp "* ]]; then keep=1; fi
    if [ "$age" -lt $(( KEEP_WEEKLY * 7 )) ] && [[ "$seen_week" != *" $week "* ]]; then keep=1; fi
    if [ "$age" -lt $(( KEEP_MONTHLY * 31 )) ] && [[ "$seen_month" != *" $month "* ]]; then keep=1; fi
    if [ "$age" -lt "$KEEP_DAILY" ]; then seen_day="$seen_day$stamp "; fi
    if [ "$age" -lt $(( KEEP_WEEKLY * 7 )) ]; then seen_week="$seen_week$week "; fi
    if [ "$age" -lt $(( KEEP_MONTHLY * 31 )) ]; then seen_month="$seen_month$month "; fi
    if [ "$keep" -eq 1 ]; then
      kept=$(( kept + 1 ))
    else
      removed=$(( removed + 1 ))
      if [ "${BACKUP_PRUNE_DRY_RUN:-0}" = "1" ]; then
        log "would delete $base"
      else
        rm -f -- "$file" "$file.sha256"
        log "deleted $base"
      fi
    fi
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'resort-*.dump*' ! -name '*.sha256' ! -name '*.partial' | sort -r)
  log "retention: kept $kept, removed $removed (daily $KEEP_DAILY, weekly $KEEP_WEEKLY, monthly $KEEP_MONTHLY)"
}

checksum_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# "user@host:port/db" without the password, for the log.
describe_url() {
  printf '%s' "$1" | sed -E 's#^[a-z]+://([^:@/]*)(:[^@]*)?@#\1@#; s#\?.*$##'
}

main() {
  case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    --prune-only)
      [ -d "$BACKUP_DIR" ] || die "BACKUP_DIR '$BACKUP_DIR' does not exist"
      prune; exit 0 ;;
    '') ;;
    *) die "unknown argument '$1' (try --help)" ;;
  esac

  local url="${BACKUP_DATABASE_URL:-${MIGRATION_DATABASE_URL:-}}"
  [ -n "$url" ] || die "BACKUP_DATABASE_URL (the OWNER role URL) is required"
  command -v "$PG_DUMP_CMD" >/dev/null 2>&1 || die "$PG_DUMP_CMD not found (install the PostgreSQL client tools, same major version as the server)"

  # Encryption mode.
  local mode="${BACKUP_ENCRYPT:-auto}" ext=""
  if [ "$mode" = "auto" ]; then
    if [ -n "${BACKUP_AGE_RECIPIENT:-}" ] && command -v age >/dev/null 2>&1; then mode=age
    elif [ -n "${BACKUP_GPG_RECIPIENT:-}" ] && command -v gpg >/dev/null 2>&1; then mode=gpg
    else mode=none; fi
  fi
  case "$mode" in
    age) command -v age >/dev/null 2>&1 || die "BACKUP_ENCRYPT=age but age is not installed"
         [ -n "${BACKUP_AGE_RECIPIENT:-}" ] || die "BACKUP_AGE_RECIPIENT is required for age"
         ext=".age" ;;
    gpg) command -v gpg >/dev/null 2>&1 || die "BACKUP_ENCRYPT=gpg but gpg is not installed"
         [ -n "${BACKUP_GPG_RECIPIENT:-}" ] || die "BACKUP_GPG_RECIPIENT is required for gpg"
         ext=".gpg" ;;
    none)
         if [ "${BACKUP_REQUIRE_ENCRYPTION:-false}" = "true" ]; then
           die "no encryption available and BACKUP_REQUIRE_ENCRYPTION=true (install age or gpg and set a recipient)"
         fi
         warn "this dump will NOT be encrypted (no age/gpg recipient configured). It holds guest personal data and the IBAN: keep it on an encrypted volume." ;;
    *) die "BACKUP_ENCRYPT must be auto, age, gpg or none (got '$mode')" ;;
  esac

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  local stamp name partial
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  name="resort-$stamp.dump$ext"
  partial="$BACKUP_DIR/$name.partial"
  trap 'rm -f -- "$partial"' EXIT

  log "dumping $(describe_url "$url") -> $BACKUP_DIR/$name (encryption: $mode)"
  case "$mode" in
    none) "$PG_DUMP_CMD" --format=custom --no-owner --dbname="$url" > "$partial" ;;
    age)  "$PG_DUMP_CMD" --format=custom --no-owner --dbname="$url" | age -r "$BACKUP_AGE_RECIPIENT" > "$partial" ;;
    gpg)  "$PG_DUMP_CMD" --format=custom --no-owner --dbname="$url" | gpg --batch --yes --trust-model always --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output - > "$partial" ;;
  esac
  [ -s "$partial" ] || die "the dump is empty"

  # A plain dump can be checked right away: pg_restore must be able to read its table of contents.
  if [ "$mode" = "none" ] && command -v "$PG_RESTORE_CMD" >/dev/null 2>&1; then
    "$PG_RESTORE_CMD" --list < "$partial" > /dev/null || die "the dump is not readable by pg_restore"
  fi

  chmod 600 "$partial"
  mv -- "$partial" "$BACKUP_DIR/$name"
  trap - EXIT
  local sum
  sum=$(checksum_of "$BACKUP_DIR/$name")
  printf '%s  %s\n' "$sum" "$name" > "$BACKUP_DIR/$name.sha256"
  chmod 600 "$BACKUP_DIR/$name.sha256"
  log "ok: $BACKUP_DIR/$name ($(wc -c < "$BACKUP_DIR/$name" | tr -d ' ') bytes, sha256 $sum)"
  prune
  log "reminder: copy this file off the machine (docs/15, backup of backups) and run scripts/restore-drill.sh monthly."
}

main "$@"
