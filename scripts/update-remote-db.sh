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

REMOTE_MYSQL_HOST="${REMOTE_MYSQL_HOST:-127.0.0.1}"
REMOTE_MYSQL_PORT="${REMOTE_MYSQL_PORT:-3310}"

if [[ ! -f backups/users.tsv ]]; then
  echo "Нет backups/users.tsv"
  exit 1
fi

ASKPASS="$(mktemp)"
PASSFILE="$(mktemp)"
SQLFILE="$(mktemp)"
cleanup() {
  rm -f "$ASKPASS" "$PASSFILE" "$SQLFILE"
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

echo "→ SQL из backups/users.tsv"
node scripts/sync-users.cjs --sql > "$SQLFILE"

echo "→ MySQL ${MYSQL_DATABASE} на ${SSH_HOST} через SSH"
COUNT="$(
  ssh $SSH_OPTS "${SSH_USER}@${SSH_HOST}" \
    "mysql --host=${REMOTE_MYSQL_HOST} --port=${REMOTE_MYSQL_PORT} --user=${MYSQL_USER} --password=${MYSQL_PASSWORD} --default-character-set=utf8mb4 --batch --skip-column-names ${MYSQL_DATABASE}" \
    < "$SQLFILE" | tail -n 1
)"

echo "серверная база ${MYSQL_DATABASE} обновлена: ${COUNT} пользователей из backups/users.tsv."
echo "Готово."
