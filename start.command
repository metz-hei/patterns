#!/bin/bash
cd "$(dirname "$0")"
# Устанавливаем права на выполнение для всех скриптов
chmod +x *.sh
chmod +x *.py
chmod +x *.command
# Запускаем основной скрипт
./start.sh 