#!/usr/bin/env bash
# Regenerates the printable client PDF from the HTML source.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HTML="$ROOT/docs/client/humphreys-direct-booking-proposal.html"
PDF="$ROOT/docs/client/Humphreys-Direct-Booking-Proposal-Architecture-NDA.pdf"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome is required to print the proposal PDF." >&2
  exit 1
fi

"$CHROME" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$PDF" "file://$HTML"
echo "Wrote $PDF"
