#!/usr/bin/env bash
# ВНИМАНИЕ: этот скрипт публикует статический сайт публично.
# Для закрытого сайта с кодами доступа используйте npm run deploy (REG.RU + PHP).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Нет файла .env. Создайте .env и заполните ключи."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${S3_BUCKET:?Задайте S3_BUCKET в .env}"
: "${S3_ACCESS_KEY_ID:?Задайте S3_ACCESS_KEY_ID в .env}"
: "${S3_SECRET_ACCESS_KEY:?Задайте S3_SECRET_ACCESS_KEY в .env}"
: "${S3_ENDPOINT:?Задайте S3_ENDPOINT в .env}"
: "${S3_REGION:?Задайте S3_REGION в .env}"

if ! command -v aws >/dev/null 2>&1; then
  echo "Нужен AWS CLI. Установите: brew install awscli"
  exit 1
fi

if [[ ! -d build ]]; then
  echo "Нет папки build/. Сначала: npm run build"
  exit 1
fi

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="$S3_REGION"

echo "→ Синхронизация build/ → s3://$S3_BUCKET/"
aws s3 sync build/ "s3://${S3_BUCKET}/" \
  --endpoint-url "$S3_ENDPOINT" \
  --delete \
  --acl public-read

echo "→ Конфигурация static site hosting"
aws s3api put-bucket-website \
  --bucket "$S3_BUCKET" \
  --website-configuration "file://${ROOT_DIR}/scripts/website-config.json" \
  --endpoint-url "$S3_ENDPOINT"

# Website host: hb.ru-msk.vkcloud-storage.ru → ru-msk.vkcloud-storage.ru
HOST="${S3_ENDPOINT#https://}"
HOST="${HOST#http://}"
HOST="${HOST#hb.}"
echo "Готово: https://${S3_BUCKET}.hb-website.${HOST}/"
