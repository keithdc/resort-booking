#!/usr/bin/env bash
# Local and CI security checks (docs/10-security-review.md, Phase 1 and 3).
#
#   bash scripts/security-check.sh            run everything that works offline, plus the dependency audit
#   bash scripts/security-check.sh --offline  skip the dependency audit (needs the network)
#
# Checks:
#   1. npm audit on production dependencies, failing on high or critical
#   2. no NEXT_PUBLIC_ variable named like a secret (SECRET, TOKEN, PASSWORD, KEY); NEXT_PUBLIC_MAPTILER_KEY is the
#      one allowed exception: a MapTiler browser key is public by design and must be restricted to our domains
#   3. no `eslint-disable` and no `as unknown as` in source (docs/02-coding-standards.md)
#   4. gitleaks secret scan, when gitleaks is installed
set -u
cd "$(dirname "$0")/.."

offline=false
if [ "${1:-}" = "--offline" ]; then
  offline=true
fi

failures=0
fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}
ok() {
  printf 'ok:   %s\n' "$1"
}

# 1. dependency audit
if [ "$offline" = true ]; then
  printf 'skip: npm audit (--offline)\n'
elif npm audit --omit=dev --audit-level=high >/dev/null 2>&1; then
  ok "npm audit: no high or critical production advisories"
else
  fail "npm audit reports high or critical production advisories (run: npm run audit:prod)"
fi

# 2. secret-looking NEXT_PUBLIC_ names (code, env files and examples; not docs or lockfiles)
public_hits=$(grep -rEn 'NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|KEY)' \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' \
  --include='.env*' --include='*.yml' --include='*.yaml' \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-measure --exclude-dir=dist \
  --exclude='package-lock.json' --exclude='*.tsbuildinfo' \
  apps packages .github 2>/dev/null | grep -v 'NEXT_PUBLIC_MAPTILER_KEY' | grep -v 'security-check.sh' || true)
if [ -n "$public_hits" ]; then
  fail "NEXT_PUBLIC_ variable named like a secret (anything NEXT_PUBLIC_ is shipped to every browser):"
  printf '%s\n' "$public_hits" >&2
else
  ok "no secret-looking NEXT_PUBLIC_ variables"
fi

# 3. banned escape hatches in source
banned=$(grep -rEn 'eslint-disable|as unknown as' \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.next-measure --exclude-dir=dist \
  apps/*/src packages/*/src 2>/dev/null || true)
if [ -n "$banned" ]; then
  fail "eslint-disable or 'as unknown as' found (not allowed by docs/02-coding-standards.md):"
  printf '%s\n' "$banned" >&2
else
  ok "no eslint-disable or 'as unknown as'"
fi

# 4. secret scan
if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --no-banner --redact --config .gitleaks.toml >/dev/null 2>&1; then
    ok "gitleaks: no secrets found"
  else
    fail "gitleaks found possible secrets (run: gitleaks detect --redact --config .gitleaks.toml -v)"
  fi
else
  printf 'skip: gitleaks is not installed (brew install gitleaks); CI runs it\n'
fi

if [ "$failures" -gt 0 ]; then
  printf '\n%s check(s) failed.\n' "$failures" >&2
  exit 1
fi
printf '\nAll security checks passed.\n'
