#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
ENV_FILE="$PROJECT_ROOT/.env.deploy"
DRY_RUN=false
DEPLOY_MODE=full
MAX_CONNECT_ATTEMPTS=3
MAX_RSYNC_ATTEMPTS=3

for argument in "$@"; do
  case "$argument" in
    --dry-run)
      DRY_RUN=true
      ;;
    --docs)
      DEPLOY_MODE=docs
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

if [[ ! "$DEPLOY_REMOTE_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  printf 'Ошибка: недопустимый удалённый путь\n' >&2
  exit 1
fi

if [[ "$DEPLOY_SSH_KEY" =~ [[:space:]] ]]; then
  printf 'Ошибка: путь DEPLOY_SSH_KEY не должен содержать пробелы\n' >&2
  exit 1
fi

if [[ "$DEPLOY_BUILD_DIR" == /* ]]; then
  build_candidate="$DEPLOY_BUILD_DIR"
else
  build_candidate="$PROJECT_ROOT/$DEPLOY_BUILD_DIR"
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
  mode_description="только документация; Android, iOS и Storybook не меняются"
else
  mode_description="полный build"
fi

remote_releases="$DEPLOY_REMOTE_ROOT/releases"
remote_staging="$remote_releases/.next"
remote_release="$remote_releases/$release_id"
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

for required_command in ssh rsync mktemp; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'Ошибка: не найдена команда %s\n' "$required_command" >&2
    exit 1
  fi
done

control_directory="$(mktemp -d /tmp/psb-deploy-ssh.XXXXXX)"
control_socket="$control_directory/control"
master_started=false

ssh_options=(
  -i "$DEPLOY_SSH_KEY"
  -p "$DEPLOY_PORT"
  -o BatchMode=yes
  -o ConnectTimeout=60
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=20
  -o ControlMaster=auto
  -o ControlPersist=600
  -o "ControlPath=$control_socket"
)

cleanup_control_connection() {
  set +e
  if [[ "$master_started" == true ]]; then
    ssh "${ssh_options[@]}" -O exit "$remote_target" >/dev/null 2>&1
  fi
  rm -f -- "$control_socket"
  rmdir -- "$control_directory" >/dev/null 2>&1
}

trap cleanup_control_connection EXIT

open_master_connection() {
  local attempt

  for ((attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1)); do
    printf 'Подключение SSH, попытка %s/%s...\n' "$attempt" "$MAX_CONNECT_ATTEMPTS"
    if ssh "${ssh_options[@]}" -N -f "$remote_target"; then
      master_started=true
      return 0
    fi

    rm -f -- "$control_socket"
    if (( attempt < MAX_CONNECT_ATTEMPTS )); then
      sleep 5
    fi
  done

  return 1
}

ensure_master_connection() {
  if ssh "${ssh_options[@]}" -O check "$remote_target" >/dev/null 2>&1; then
    return 0
  fi

  master_started=false
  rm -f -- "$control_socket"
  open_master_connection
}

if ! open_master_connection; then
  printf 'Ошибка: не удалось установить SSH-соединение после %s попыток.\n' "$MAX_CONNECT_ATTEMPTS" >&2
  exit 1
fi

printf 'Проверка сервера...\n'
ssh "${ssh_options[@]}" "$remote_target" \
  "test -d '$remote_releases' && test -w '$remote_releases' && sudo -n -l /usr/bin/systemctl reload php-fpm >/dev/null"

previous_current="$(ssh "${ssh_options[@]}" "$remote_target" \
  "readlink '$DEPLOY_REMOTE_ROOT/current' 2>/dev/null || true")"

if [[ ! "$previous_current" =~ ^releases/[A-Za-z0-9._-]+$ ]]; then
  printf 'Ошибка: current не указывает на корректный релиз.\n' >&2
  exit 1
fi

printf 'Подготовка возобновляемой папки .next...\n'
ssh "${ssh_options[@]}" "$remote_target" \
  "set -eu; active_release='$DEPLOY_REMOTE_ROOT/$previous_current'; test -d \"\$active_release\"; if test -e '$remote_staging'; then test -d '$remote_staging' && test ! -L '$remote_staging'; else mkdir '$remote_staging'; cp -al -- \"\$active_release/.\" '$remote_staging/'; fi"

if [[ "$DEPLOY_MODE" == docs ]]; then
  printf 'Фиксация текущих Android, iOS и Storybook...\n'
  ssh "${ssh_options[@]}" "$remote_target" \
    "set -eu; active_release='$DEPLOY_REMOTE_ROOT/$previous_current'; for target_path in '$remote_staging/android-general' '$remote_staging/ios-rb' '$remote_staging/ios-smb' '$remote_staging'/storybook-*; do if test -e \"\$target_path\"; then rm -rf -- \"\$target_path\"; fi; done; for source_path in \"\$active_release\"/android-general \"\$active_release\"/ios-rb \"\$active_release\"/ios-smb \"\$active_release\"/storybook-*; do if test -e \"\$source_path\"; then cp -al -- \"\$source_path\" '$remote_staging/'; fi; done"
fi

rsync_shell="ssh -i $DEPLOY_SSH_KEY -p $DEPLOY_PORT -o BatchMode=yes -o ConnectTimeout=60 -o ServerAliveInterval=30 -o ServerAliveCountMax=20 -o ControlMaster=auto -o ControlPersist=600 -o ControlPath=$control_socket"
rsync_options=(
  -a
  --delete-delay
  --partial
  --partial-dir=.rsync-partial
)

# В macOS rsync — это openrsync: --info=progress2 и --human-readable
# он не поддерживает. Выбираем флаги прогресса по возможностям бинарника.
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
  printf 'Передача изменений документации...\n'
else
  printf 'Передача изменений полного build...\n'
fi

rsync_succeeded=false
for ((attempt = 1; attempt <= MAX_RSYNC_ATTEMPTS; attempt += 1)); do
  printf 'rsync, попытка %s/%s...\n' "$attempt" "$MAX_RSYNC_ATTEMPTS"
  if rsync \
    "${rsync_options[@]}" \
    -e "$rsync_shell" \
    "$BUILD_DIR/" \
    "$remote_target:$remote_staging/"; then
    rsync_succeeded=true
    break
  fi

  if (( attempt < MAX_RSYNC_ATTEMPTS )); then
    printf 'Передача оборвалась; частичные файлы сохранены. Повтор...\n' >&2
    sleep 5
    ensure_master_connection
  fi
done

if [[ "$rsync_succeeded" != true ]]; then
  printf 'Ошибка: файлы не переданы полностью. current не переключён; повторный запуск продолжит загрузку.\n' >&2
  exit 1
fi

ensure_master_connection
ssh "${ssh_options[@]}" "$remote_target" \
  "set -eu; test -f '$remote_staging/index.html'; test -f '$remote_staging/gate.php'; rm -rf -- '$remote_staging/.rsync-partial'; test ! -e '$remote_release'; mv '$remote_staging' '$remote_release'"

rollback_current() {
  printf 'Возврат на предыдущую версию %s...\n' "$previous_current" >&2
  ssh "${ssh_options[@]}" "$remote_target" \
    "set -eu; cd '$DEPLOY_REMOTE_ROOT'; ln -s '$previous_current' '.rollback.$release_id'; mv -Tf '.rollback.$release_id' current; sudo -n /usr/bin/systemctl reload php-fpm; rm -rf -- '$remote_release'"
}

printf 'Переключение current на %s...\n' "$release_id"
ssh "${ssh_options[@]}" "$remote_target" \
  "set -eu; cd '$DEPLOY_REMOTE_ROOT'; ln -s 'releases/$release_id' '.current.$release_id'; mv -Tf '.current.$release_id' current"

printf 'Обновление PHP-FPM...\n'
if ! ssh "${ssh_options[@]}" "$remote_target" \
  "sudo -n /usr/bin/systemctl reload php-fpm"; then
  printf 'Ошибка: PHP-FPM не обновлён.\n' >&2
  rollback_current
  exit 1
fi

if ! ssh "${ssh_options[@]}" "$remote_target" \
  "curl --fail --silent --show-error --insecure --max-time 30 '$DEPLOY_HEALTHCHECK_URL' >/dev/null"; then
  printf 'Ошибка: новая версия не прошла HTTP-проверку.\n' >&2
  rollback_current
  exit 1
fi

printf 'Удаление предыдущей версии и старых временных папок...\n'
release_listing="$(ssh "${ssh_options[@]}" "$remote_target" \
  "find '$remote_releases' -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | LC_ALL=C sort")"

# mapfile появился только в bash 4, а в macOS системный bash — 3.2.
remote_directories=()
while IFS= read -r directory_name; do
  if [[ -n "$directory_name" ]]; then
    remote_directories+=("$directory_name")
  fi
done <<< "$release_listing"

for directory_name in "${remote_directories[@]}"; do
  [[ -n "$directory_name" ]] || continue
  [[ "$directory_name" == "$release_id" ]] && continue

  if [[ ! "$directory_name" =~ ^\.?[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    printf 'Ошибка: небезопасное имя серверной папки: %s\n' "$directory_name" >&2
    exit 1
  fi

  ssh "${ssh_options[@]}" "$remote_target" \
    "set -eu; test \"\$(readlink '$DEPLOY_REMOTE_ROOT/current')\" != 'releases/$directory_name'; rm -rf -- '$remote_releases/$directory_name'"
done

printf '\nДеплой завершён успешно.\n'
printf 'Текущий релиз: %s\n' "$release_id"
printf 'Сайт: %s\n' "$DEPLOY_PUBLIC_URL"
