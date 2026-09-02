#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${SSH_HOST:?В .env нет SSH_HOST}"
: "${SSH_USER:?В .env нет SSH_USER}"
: "${DEPLOY_PATH:?В .env нет DEPLOY_PATH}"

DEPLOY_PATH="${DEPLOY_PATH%/}/"

SHOWCASE_EXCLUDES=(
  --exclude 'storybook-calendar/'
  --exclude 'storybook-file-upload/'
  --exclude 'storybook-general/'
  --exclude 'storybook-smb/'
  --exclude 'storybook-pc/'
  --exclude 'storybook-bc/'
  --exclude 'ios-rb/'
  --exclude 'ios-smb/'
  --exclude 'android-general/'
)

if [[ -z "${SSH_PASSWORD:-}" ]]; then
  echo "В .env нет SSH_PASSWORD (пароль хостинга из вкладки «Доступы» в REG.RU)."
  exit 1
fi

echo "→ npm run build (без проверки витрин)"
npm run build

ASKPASS="$(mktemp)"
PASSFILE="$(mktemp)"
cleanup() {
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

echo "→ SSH ${SSH_USER}@${SSH_HOST}"
ssh $SSH_OPTS "${SSH_USER}@${SSH_HOST}" "mkdir -p '${DEPLOY_PATH}'"

echo "→ rsync build/ → ${DEPLOY_PATH} (витрины на сервере не трогаем)"
rsync -a --delete --info=progress2 \
  --chmod=ugo=rX,u+w \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.user.ini' \
  --exclude 'error_log' \
  --exclude 'backups' \
  --exclude '*.sql' \
  --exclude '*.tsv' \
  "${SHOWCASE_EXCLUDES[@]}" \
  -e "ssh $SSH_OPTS" \
  build/ "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}"

echo "Готово: https://zdesbildizain.ru/"
echo "Витрины (Storybook, iOS, Android) на сервере остались без изменений."
echo "Для полного деплоя с витринами: npm run deploy"
