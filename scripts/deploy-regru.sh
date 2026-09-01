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

SHOWCASES=(
  storybook-calendar
  storybook-file-upload
  storybook-general
  storybook-smb
  storybook-pc
  storybook-bc
  ios-rb
  ios-smb
  android-general
)

require_showcases() {
  local root="$1"
  local missing=()
  local dir
  for dir in "${SHOWCASES[@]}"; do
    if [[ ! -d "${root}/${dir}" ]] || [[ -z "$(ls -A "${root}/${dir}" 2>/dev/null)" ]]; then
      missing+=("$dir")
    fi
  done
  if ((${#missing[@]})); then
    echo "Нет витрин в ${root}/: ${missing[*]}"
    echo "Положите сборки в static/, затем снова npm run deploy."
    exit 1
  fi
}

if [[ -z "${SSH_PASSWORD:-}" ]]; then
  echo "В .env нет SSH_PASSWORD (пароль хостинга из вкладки «Доступы» в REG.RU)."
  exit 1
fi

require_showcases static

echo "→ npm run build"
npm run build
require_showcases build

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

echo "→ rsync build/ → ${DEPLOY_PATH}"
rsync -a --delete --info=progress2 \
  --chmod=ugo=rX,u+w \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.user.ini' \
  --exclude 'error_log' \
  --exclude 'backups' \
  --exclude '*.sql' \
  --exclude '*.tsv' \
  -e "ssh $SSH_OPTS" \
  build/ "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}"

echo "Готово: https://zdesbildizain.ru/"
echo "Проверьте, что .env лежит вне document root, например рядом с www/, а не внутри ${DEPLOY_PATH}"
