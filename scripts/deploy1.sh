#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
ENV_FILE="$PROJECT_ROOT/.env.deploy"
DRY_RUN=false
DEPLOY_MODE=full
# Сборка включена по умолчанию: иначе легко задеплоить устаревший build/.
# Отключается флагом --no-build (например, когда build/ уже собран заранее).
RUN_BUILD=true

for argument in "$@"; do
  case "$argument" in
    --dry-run)
      DRY_RUN=true
      ;;
    --docs)
      DEPLOY_MODE=docs
      ;;
    --build)
      RUN_BUILD=true
      ;;
    --no-build)
      RUN_BUILD=false
      ;;
    *)
      printf 'Ошибка: неизвестный аргумент: %s\n' "$argument" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Ошибка: не найден %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required_variables=(
  DEPLOY_HOST
  DEPLOY_PORT
  DEPLOY_USER
  DEPLOY_SSH_KEY
  DEPLOY_BUILD_DIR
  DEPLOY_REMOTE_ROOT
  DEPLOY_HEALTHCHECK_URL
  DEPLOY_PUBLIC_URL
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    printf 'Ошибка: в %s не задана переменная %s\n' "$ENV_FILE" "$variable_name" >&2
    exit 1
  fi
done

if [[ ! "$DEPLOY_HOST" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  printf 'Ошибка: недопустимое имя или IP сервера\n' >&2
  exit 1
fi

if [[ ! "$DEPLOY_USER" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf 'Ошибка: недопустимое имя SSH-пользователя\n' >&2
  exit 1
fi

if [[ ! "$DEPLOY_PORT" =~ ^[0-9]+$ ]]; then
  printf 'Ошибка: DEPLOY_PORT должен содержать только цифры\n' >&2
  exit 1
fi

# Путь к ключу может быть относительным: считаем его от корня проекта.
if [[ "$DEPLOY_SSH_KEY" != /* ]]; then
  DEPLOY_SSH_KEY="$PROJECT_ROOT/$DEPLOY_SSH_KEY"
fi

if [[ ! "$DEPLOY_REMOTE_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  printf 'Ошибка: недопустимый удалённый путь\n' >&2
  exit 1
fi

if [[ "$DEPLOY_BUILD_DIR" == /* ]]; then
  build_candidate="$DEPLOY_BUILD_DIR"
else
  build_candidate="$PROJECT_ROOT/$DEPLOY_BUILD_DIR"
fi

# Сборка идёт в обоих режимах — и полном, и --docs: showcases исключаются
# только на этапе rsync, а HTML/JS из docs/ и src/ должны быть актуальны.
# Выполняется до проверки папки build/ и до выхода в --dry-run, чтобы была
# видна ошибка сборки, а не молчаливая отправка старого содержимого.
if [[ "$DRY_RUN" != true && "$RUN_BUILD" == true ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    printf 'Ошибка: не найдена команда npm (нужна для сборки; отключить — --no-build)\n' >&2
    exit 1
  fi
  printf 'Сборка проекта: npm run build...\n'
  ( cd "$PROJECT_ROOT" && npm run build )
fi

if [[ "$DRY_RUN" == true ]]; then
  printf 'Режим dry-run: сборка пропущена, проверяется существующий %s.\n' "$DEPLOY_BUILD_DIR"
fi

if [[ "$RUN_BUILD" != true ]]; then
  printf 'ВНИМАНИЕ: сборка отключена (--no-build) — заливается текущее содержимое %s.\n' \
    "$DEPLOY_BUILD_DIR" >&2
fi

if [[ ! -d "$build_candidate" ]]; then
  printf 'Ошибка: не найдена папка сборки %s\n' "$build_candidate" >&2
  exit 1
fi

BUILD_DIR="$(cd "$build_candidate" && pwd -P)"

for required_file in index.html gate.php; do
  if [[ ! -f "$BUILD_DIR/$required_file" ]]; then
    printf 'Ошибка: в build нет обязательного файла %s\n' "$required_file" >&2
    exit 1
  fi
done

if [[ ! -f "$DEPLOY_SSH_KEY" ]]; then
  printf 'Ошибка: не найден SSH-ключ %s\n' "$DEPLOY_SSH_KEY" >&2
  exit 1
fi

release_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
if [[ "$DEPLOY_MODE" == docs ]]; then
  release_id="$release_id-docs"
  mode_description="только документация; showcase-каталоги сохраняются из current"
else
  mode_description="полный build"
fi
remote_release="$DEPLOY_REMOTE_ROOT/releases/$release_id"
remote_staging="$DEPLOY_REMOTE_ROOT/releases/.$release_id.uploading"
remote_target="$DEPLOY_USER@$DEPLOY_HOST"

printf 'Сборка:          %s\n' "$BUILD_DIR"
printf 'Режим:           %s\n' "$mode_description"
printf 'Сервер:          %s\n' "$remote_target"
printf 'Новый релиз:     %s\n' "$remote_release"
printf 'Публичный URL:   %s\n' "$DEPLOY_PUBLIC_URL"

if [[ "$DRY_RUN" == true ]]; then
  printf '\nТестовый режим: SSH не запускался, файлы на сервер не передавались.\n'
  printf 'Локальная проверка завершена успешно.\n'
  exit 0
fi

for required_command in ssh rsync; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'Ошибка: не найдена команда %s\n' "$required_command" >&2
    exit 1
  fi
done

# ServerAlive* держат соединение живым и заставляют разорвать его быстро,
# если сервер перестал отвечать: иначе ssh молча висит до TCP-таймаута,
# а rsync падает с "Connection timed out during banner exchange" уже
# под конец заливки.
ssh_options=(
  -i "$DEPLOY_SSH_KEY"
  -p "$DEPLOY_PORT"
  -o BatchMode=yes
  -o ConnectTimeout=30
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=6
  -o TCPKeepAlive=yes
  -o StrictHostKeyChecking=accept-new
)

# Если деплой упадёт до переименования staging в релиз, каталог
# .<release>.uploading останется на сервере навсегда: автоочистка
# пропускает скрытые каталоги. Поэтому подчищаем его на выходе.
cleanup_remote_staging() {
  ssh "${ssh_options[@]}" "$remote_target" \
    "rm -rf '$remote_staging'" >/dev/null 2>&1 || true
}
trap cleanup_remote_staging EXIT

printf '\nПроверка SSH-доступа...\n'
ssh "${ssh_options[@]}" "$remote_target" \
  "test -d '$DEPLOY_REMOTE_ROOT/releases' && test -w '$DEPLOY_REMOTE_ROOT/releases' && sudo -n -l /usr/bin/systemctl reload php-fpm >/dev/null"

previous_current="$(ssh "${ssh_options[@]}" "$remote_target" \
  "readlink '$DEPLOY_REMOTE_ROOT/current' 2>/dev/null || true")"

if [[ "$DEPLOY_MODE" == docs && ! "$previous_current" =~ ^releases/[A-Za-z0-9._-]+$ ]]; then
  printf 'Ошибка: deploy:docs требует существующий current от предыдущего деплоя.\n' >&2
  exit 1
fi

rollback_current() {
  if [[ "$previous_current" =~ ^releases/[A-Za-z0-9._-]+$ ]]; then
    printf 'Возврат на предыдущий релиз %s...\n' "$previous_current" >&2
    ssh "${ssh_options[@]}" "$remote_target" \
      "set -eu; cd '$DEPLOY_REMOTE_ROOT'; ln -s '$previous_current' '.rollback.$release_id'; mv -Tf '.rollback.$release_id' current; sudo -n /usr/bin/systemctl reload php-fpm"
  else
    printf 'Предыдущий current не распознан; автооткат не выполнен.\n' >&2
  fi
}

ssh "${ssh_options[@]}" "$remote_target" \
  "set -eu; test ! -e '$remote_staging'; test ! -e '$remote_release'; mkdir '$remote_staging'"

if [[ "$DEPLOY_MODE" == docs ]]; then
  printf 'Сохранение текущих Android, iOS и Storybook...\n'
  ssh "${ssh_options[@]}" "$remote_target" \
    "set -eu; current_release='$DEPLOY_REMOTE_ROOT/$previous_current'; test -d \"\$current_release\"; for source_path in \"\$current_release\"/android-general \"\$current_release\"/ios-rb \"\$current_release\"/ios-smb \"\$current_release\"/storybook-*; do if test -e \"\$source_path\"; then cp -al -- \"\$source_path\" '$remote_staging/'; fi; done"
fi

if [[ "$DEPLOY_SSH_KEY" =~ [[:space:]] ]]; then
  printf 'Ошибка: rsync не поддерживает пробелы в пути DEPLOY_SSH_KEY\n' >&2
  exit 1
fi

rsync_shell="ssh -i $DEPLOY_SSH_KEY -p $DEPLOY_PORT -o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o TCPKeepAlive=yes -o StrictHostKeyChecking=accept-new"
rsync_options=(
  -a
  --delete
  --partial
)

# В macOS rsync — это openrsync: --info=progress2 и --human-readable
# он не поддерживает, поэтому выбор флагов прогресса делаем по возможностям.
rsync_help="$(rsync --help 2>&1 || true)"
if [[ "$rsync_help" == *info=progress2* ]]; then
  rsync_options+=(--info=progress2)
elif [[ "$rsync_help" == *--progress* ]]; then
  rsync_options+=(--progress)
fi
if [[ "$rsync_help" == *--human-readable* ]]; then
  rsync_options+=(--human-readable)
fi

if [[ "$DEPLOY_MODE" == docs ]]; then
  rsync_options+=(
    --exclude=/android-general/
    --exclude=/ios-rb/
    --exclude=/ios-smb/
    '--exclude=/storybook*/'
  )
  printf 'Копирование build без Android, iOS и Storybook...\n'
else
  printf 'Копирование полного build...\n'
fi

# Заливка с повторами: на этом сервере ssh иногда отваливается на
# последних файлах (Connection timed out during banner exchange).
# --partial позволяет продолжить с места обрыва, а перед повтором
# staging-каталог пересоздаётся с нуля (или заново линкуется в docs-режиме).
upload_attempts="${DEPLOY_UPLOAD_ATTEMPTS:-3}"
upload_attempt=1
rsync_exit=1
while (( upload_attempt <= upload_attempts )); do
  if (( upload_attempt > 1 )); then
    printf 'Повтор заливки %d/%d после ошибки rsync...\n' "$upload_attempt" "$upload_attempts" >&2
    ssh "${ssh_options[@]}" "$remote_target" \
      "set -eu; rm -rf '$remote_staging'; mkdir '$remote_staging'" >/dev/null 2>&1 || true
    if [[ "$DEPLOY_MODE" == docs ]]; then
      ssh "${ssh_options[@]}" "$remote_target" \
        "set -eu; current_release='$DEPLOY_REMOTE_ROOT/$previous_current'; for source_path in \"\$current_release\"/android-general \"\$current_release\"/ios-rb \"\$current_release\"/ios-smb \"\$current_release\"/storybook-*; do if test -e \"\$source_path\"; then cp -al -- \"\$source_path\" '$remote_staging/'; fi; done" >/dev/null 2>&1 || true
    fi
  fi

  rsync_exit=0
  # Явная обработка статуса: конструкция "cmd && x=0 && break" под set -e
  # ведёт себя неочевидно, а так ошибка видна и цикл гарантированно считает её.
  rsync \
    "${rsync_options[@]}" \
    -e "$rsync_shell" \
    "$BUILD_DIR/" \
    "$remote_target:$remote_staging/" || rsync_exit=$?

  if (( rsync_exit == 0 )); then
    break
  fi

  printf 'rsync завершился с кодом %d.\n' "$rsync_exit" >&2
  upload_attempt=$(( upload_attempt + 1 ))
done

if (( rsync_exit != 0 )); then
  printf 'Ошибка: заливка файлов не удалась после %d попыток.\n' "$upload_attempts" >&2
  exit "$rsync_exit"
fi

ssh "${ssh_options[@]}" "$remote_target" \
  "set -eu; test -f '$remote_staging/index.html'; test -f '$remote_staging/gate.php'; mv '$remote_staging' '$remote_release'"

printf 'Переключение current на %s...\n' "$release_id"
ssh "${ssh_options[@]}" "$remote_target" \
  "set -eu; cd '$DEPLOY_REMOTE_ROOT'; ln -s 'releases/$release_id' '.current.$release_id'; mv -Tf '.current.$release_id' current"


printf 'Обновление PHP-FPM...\n'
if ! ssh "${ssh_options[@]}" "$remote_target" \
  "sudo -n /usr/bin/systemctl reload php-fpm"; then
  printf 'Ошибка: PHP-FPM не перезагружен и может выдавать предыдущий релиз.\n' >&2
  rollback_current
  exit 1
fi

if ! ssh "${ssh_options[@]}" "$remote_target" \
  "curl --fail --silent --show-error --insecure --max-time 15 '$DEPLOY_HEALTHCHECK_URL' >/dev/null"; then
  printf 'Ошибка: новый релиз не прошёл HTTP-проверку.\n' >&2
  rollback_current
  exit 1
fi

# Статический healthcheck не замечает сломанное API (например, недоступную
# из PHP БД), поэтому дополнительно дёргаем PHP-эндпоинт.
# Ожидаемый ответ задаётся регулярным выражением DEPLOY_SMOKE_EXPECT
# (по умолчанию — только 2xx). Пустой ответ, 5xx и неожиданный 4xx
# (в т.ч. 404 от забытого эндпоинта) считаются сбоем.
# Для эндпоинтов, которые идут в БД, задайте DEPLOY_SMOKE_METHOD=POST и
# DEPLOY_SMOKE_BODY — тогда проверка поймает и недоступную базу.
if [[ -n "${DEPLOY_SMOKE_URL:-}" ]]; then
  smoke_expect="${DEPLOY_SMOKE_EXPECT:-^2[0-9][0-9]$}"
  smoke_command="curl --silent --insecure --max-time 15 --output /dev/null --write-out '%{http_code}'"

  if [[ "${DEPLOY_SMOKE_METHOD:-GET}" == POST ]]; then
    smoke_body="${DEPLOY_SMOKE_BODY:-}"
    smoke_body="${smoke_body//\'/\'\\\'\'}"
    smoke_command="$smoke_command -X POST -H 'Content-Type: application/json' --data-raw '$smoke_body'"
  fi

  smoke_command="$smoke_command '$DEPLOY_SMOKE_URL'"

  smoke_code="$(ssh "${ssh_options[@]}" "$remote_target" "$smoke_command" || true)"

  if [[ ! "$smoke_code" =~ $smoke_expect ]]; then
    printf 'Ошибка: API-проверка %s вернула %s (ожидался ответ по маске %s).\n' \
      "$DEPLOY_SMOKE_URL" "${smoke_code:-<нет ответа>}" "$smoke_expect" >&2
    rollback_current
    exit 1
  fi

  printf 'API-проверка: %s -> %s\n' "$DEPLOY_SMOKE_URL" "$smoke_code"
fi

printf 'Очистка старых релизов...\n'
release_listing="$(ssh "${ssh_options[@]}" "$remote_target" \
  "find '$DEPLOY_REMOTE_ROOT/releases' -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\\n' | LC_ALL=C sort")"

# mapfile появился только в bash 4, а в macOS системный bash — 3.2.
remote_releases=()
while IFS= read -r release_name; do
  if [[ -n "$release_name" ]]; then
    remote_releases+=("$release_name")
  fi
done <<< "$release_listing"

while (( ${#remote_releases[@]} > 3 )); do
  delete_index=-1

  for index in "${!remote_releases[@]}"; do
    if [[ "${remote_releases[$index]}" != "$release_id" ]]; then
      delete_index="$index"
      break
    fi
  done

  if (( delete_index < 0 )); then
    printf 'Ошибка: не найден безопасный релиз для удаления.\n' >&2
    exit 1
  fi

  old_release="${remote_releases[$delete_index]}"
  if [[ ! "$old_release" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    printf 'Ошибка: небезопасное имя релиза: %s\n' "$old_release" >&2
    exit 1
  fi

  printf '  Удаление %s\n' "$old_release"
  ssh "${ssh_options[@]}" "$remote_target" \
    "set -eu; test \"\$(readlink '$DEPLOY_REMOTE_ROOT/current')\" != 'releases/$old_release'; rm -rf -- '$DEPLOY_REMOTE_ROOT/releases/$old_release'"

  unset 'remote_releases[delete_index]'
  remote_releases=("${remote_releases[@]}")
done

printf 'Релизов на сервере: %s\n' "${#remote_releases[@]}"

printf '\nДеплой завершён успешно.\n'
printf 'Текущий релиз: %s\n' "$release_id"
printf 'Сайт: %s\n' "$DEPLOY_PUBLIC_URL"
