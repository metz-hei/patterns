#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Нет файла .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${SSH_HOST:?В .env нет SSH_HOST}"
: "${SSH_USER:?В .env нет SSH_USER}"
: "${SSH_PASSWORD:?В .env нет SSH_PASSWORD}"
: "${MYSQL_USER:?В .env нет MYSQL_USER}"
: "${MYSQL_PASSWORD:?В .env нет MYSQL_PASSWORD}"
: "${MYSQL_DATABASE:?В .env нет MYSQL_DATABASE}"

LOCAL_PORT="${MYSQL_PORT:-3310}"
REMOTE_MYSQL_HOST="${REMOTE_MYSQL_HOST:-127.0.0.1}"
REMOTE_MYSQL_PORT="${REMOTE_MYSQL_PORT:-3306}"

if [[ ! -f backups/users.tsv ]]; then
  echo "Нет backups/users.tsv"
  exit 1
fi

ASKPASS="$(mktemp)"
PASSFILE="$(mktemp)"
cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  rm -f "$ASKPASS" "$PASSFILE"
}
trap cleanup EXIT

printf '%s\n' "$SSH_PASSWORD" > "$PASSFILE"
chmod 600 "$PASSFILE"
cat > "$ASKPASS" <<EOF
#!/bin/sh
cat '$PASSFILE'
EOF
chmod 700 "$ASKPASS"

export SSH_ASKPASS="$ASKPASS"
export SSH_ASKPASS_REQUIRE=force
export DISPLAY="${DISPLAY:-:0}"

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no -o ConnectTimeout=20"

if ! nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
  echo "→ SSH-туннель 127.0.0.1:${LOCAL_PORT} → ${REMOTE_MYSQL_HOST}:${REMOTE_MYSQL_PORT}"
  ssh $SSH_OPTS -f -N \
    -L "127.0.0.1:${LOCAL_PORT}:${REMOTE_MYSQL_HOST}:${REMOTE_MYSQL_PORT}" \
    "${SSH_USER}@${SSH_HOST}"
  sleep 2
fi

if ! nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
  echo "Не удалось открыть туннель к MySQL на ${SSH_HOST}"
  exit 1
fi

echo "→ Обновление ${MYSQL_DATABASE}"
MYSQL_HOST=127.0.0.1 MYSQL_PORT="$LOCAL_PORT" node scripts/sync-users.cjs --remote

echo "Готово."
