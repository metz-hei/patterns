#!/bin/bash

# Проверяем наличие Python
if ! command -v python3 &> /dev/null; then
    echo "Python 3 не найден. Установка Python 3..."
    
    # Проверяем наличие Homebrew
    if ! command -v brew &> /dev/null; then
        echo "Установка Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Добавляем Homebrew в PATH
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    
    # Устанавливаем Python через Homebrew
    brew install python
fi

# Проверяем версию Python
python3 --version

# Устанавливаем права на выполнение для скриптов
chmod +x start.sh
chmod +x start.py

echo "Установка завершена. Запустите ./start.sh для запуска сервера." 