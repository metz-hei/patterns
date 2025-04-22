#!/bin/bash
cd "$(dirname "$0")"
# Снимаем атрибуты расширенных прав доступа
xattr -cr .
# Устанавливаем права на выполнение для всех скриптов
chmod +x setup/*.sh
chmod +x setup/*.py
# Запускаем скрипт установки
./setup/setup.sh
# Запускаем основной скрипт через Python
python3 ./setup/start.py 