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

: "${MYSQL_HOST:=localhost}"
: "${MYSQL_PORT:=3306}"
: "${MYSQL_USER:?Задайте MYSQL_USER в .env}"
: "${MYSQL_PASSWORD:?Задайте MYSQL_PASSWORD в .env}"
: "${MYSQL_DATABASE:?Задайте MYSQL_DATABASE в .env}"

mkdir -p backups
OUT="backups/${MYSQL_DATABASE}.sql"

mysqldump \
  -h "$MYSQL_HOST" \
  -P "$MYSQL_PORT" \
  -u "$MYSQL_USER" \
  -p"$MYSQL_PASSWORD" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  "$MYSQL_DATABASE" > "$OUT"

echo "Дамп записан в $OUT"
