#!/usr/bin/env bash
# Starts Postgres + Redis with whichever Docker runtime is available (Docker Desktop or OrbStack).
# Idempotent: safe to run before every migrate.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI not found. Install OrbStack (https://orbstack.dev) or Docker Desktop." >&2
  exit 1
fi

# Daemon not answering: start OrbStack if present, otherwise tell the user.
if ! docker info >/dev/null 2>&1; then
  if command -v orbctl >/dev/null 2>&1; then
    echo "Docker daemon is not running; starting OrbStack..."
    orbctl start
  else
    echo "Docker daemon is not running. Start Docker Desktop or OrbStack and retry." >&2
    exit 1
  fi
fi

docker compose up -d --wait postgres redis
