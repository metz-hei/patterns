#!/bin/bash

# Устанавливаем права на выполнение для скриптов
chmod 755 "$(dirname "$0")/start.py"

# Проверяем наличие Python
if ! command -v python3 &> /dev/null; then
    echo "Python 3 не найден. Установка Python 3..."
    
    # Проверяем наличие Homebrew
    if ! command -v brew &> /dev/null; then
        echo "Установка Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Добавляем Homebrew в PATH
        if [ -d "/opt/homebrew" ]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -d "/usr/local/Homebrew" ]; then
            echo 'eval "$(/usr/local/Homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/usr/local/Homebrew/bin/brew shellenv)"
        fi
    fi
    
    # Устанавливаем Python через Homebrew
    brew install python
fi

# Проверяем версию Python
python3 --version

# Запускаем Python-сервер
"$(dirname "$0")/start.py" 