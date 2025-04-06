import sys
import subprocess
import platform
import os

def check_python():
    try:
        # Проверяем версию Python
        result = subprocess.run(['python3', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"Python установлен: {result.stdout.strip()}")
            return True
    except FileNotFoundError:
        pass
    
    try:
        # Проверяем альтернативную команду
        result = subprocess.run(['python', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"Python установлен: {result.stdout.strip()}")
            return True
    except FileNotFoundError:
        pass
    
    return False

def install_python():
    system = platform.system()
    print(f"Обнаружена операционная система: {system}")
    
    if system == "Darwin":  # macOS
        print("Проверяем наличие Homebrew...")
        try:
            subprocess.run(['brew', '--version'], check=True, capture_output=True)
            print("Устанавливаем Python через Homebrew...")
            subprocess.run(['brew', 'install', 'python'], check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("Homebrew не установлен. Пожалуйста, установите Python вручную с сайта python.org")
            return False
            
    elif system == "Linux":
        print("Устанавливаем Python через пакетный менеджер...")
        try:
            # Пробуем apt (Ubuntu/Debian)
            subprocess.run(['sudo', 'apt-get', 'update'], check=True)
            subprocess.run(['sudo', 'apt-get', 'install', '-y', 'python3'], check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            try:
                # Пробуем yum (CentOS/RHEL)
                subprocess.run(['sudo', 'yum', 'install', '-y', 'python3'], check=True)
                return True
            except (subprocess.CalledProcessError, FileNotFoundError):
                print("Не удалось установить Python автоматически. Пожалуйста, установите Python вручную")
                return False
                
    elif system == "Windows":
        print("Для Windows Python необходимо установить вручную:")
        print("1. Перейдите на сайт python.org")
        print("2. Скачайте последнюю версию Python")
        print("3. Запустите установщик")
        print("4. Не забудьте отметить опцию 'Add Python to PATH'")
        return False
        
    else:
        print(f"Неизвестная операционная система: {system}")
        print("Пожалуйста, установите Python вручную")
        return False

def main():
    if check_python():
        print("Python уже установлен, запускаем сервер...")
        import start
        start.start_server()
    else:
        print("Python не найден, пытаемся установить...")
        if install_python():
            print("Python успешно установлен, запускаем сервер...")
            import start
            start.start_server()
        else:
            print("Не удалось установить Python автоматически")
            print("Пожалуйста, установите Python вручную и попробуйте снова")

if __name__ == "__main__":
    main() 