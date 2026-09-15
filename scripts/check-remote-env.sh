#!/usr/bin/env bash
# Проверяет, где на хостинге лежит .env относительно document root.
#
# Запуск: npm run env:check (нужен заполненный .env с SSH_* и DEPLOY_PATH).
# Из deploy-скриптов вызывается повторно — при готовом SSH_ASKPASS ничего не пересоздаёт.
#
# Коды выхода:
#   0 — .env найден вне document root
#   1 — .env не найден (API не поднимется)
#   2 — .env лежит внутри document root (работает, но это лишний риск)

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${SSH_HOST:?check-remote-env: в .env нет SSH_HOST}"
: "${SSH_USER:?check-remote-env: в .env нет SSH_USER}"
: "${DEPLOY_PATH:?check-remote-env: в .env нет DEPLOY_PATH}"

SSH_OPTS="${SSH_OPTS:--o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no -o ConnectTimeout=20}"
export SSH_OPTS

# Если пароль ещё не настроен — настраиваем сами. Путь до несуществующего
# хелпера (осиротевший SSH_ASKPASS из прошлой сессии) тоже считаем отсутствием.
if [[ -z "${SSH_ASKPASS:-}" || ! -x "${SSH_ASKPASS:-}" ]]; then
  : "${SSH_PASSWORD:?check-remote-env: в .env нет SSH_PASSWORD}"
  ASKPASS="$(mktemp)"
  PASSFILE="$(mktemp)"
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
  trap 'rm -f "$ASKPASS" "$PASSFILE"' EXIT
fi

DOCROOT="${DEPLOY_PATH%/}"
SITE_NAME="$(basename "$DOCROOT")"

# shellcheck disable=SC2086
ssh $SSH_OPTS "${SSH_USER}@${SSH_HOST}" "
  docroot='${DOCROOT}'
  site='${SITE_NAME}'
  www=\$(dirname \"\$docroot\")
  account=\$(dirname \"\$www\")

  rc=1
  for f in \"\$docroot/.env\" \"\$www/\$site.env\" \"\$www/.env\" \"\$account/\$site/.env\" \"\$account/.env\"; do
    [ -f \"\$f\" ] || continue
    if [ \"\$f\" = \"\$docroot/.env\" ]; then
      echo \"  ! .env внутри document root: \$f\"
      echo '    По HTTP он не отдаётся (.htaccess блокирует), но это лишь вторая линия защиты.'
      [ \"\$rc\" = 1 ] && rc=2
    else
      echo \"  + .env вне document root: \$f\"
      [ \"\$rc\" = 2 ] || rc=0
    fi
  done

  if [ \"\$rc\" = 1 ]; then
    echo '  x .env на сервере не найден — /api/auth/login вернёт 500.'
    echo '    Скопируйте файл одним из способов:'
    echo \"      scp .env ${SSH_USER}@${SSH_HOST}:\$www/\$site.env\"
    echo \"      scp .env ${SSH_USER}@${SSH_HOST}:\$account/\$site/.env\"
  fi

  exit \$rc
"
