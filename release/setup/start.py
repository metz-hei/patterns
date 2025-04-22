import http.server
import socketserver
import webbrowser
import os
from pathlib import Path

# Порт для локального сервера
PORT = 8000

# Путь к текущей директории
current_dir = Path(__file__).parent.parent

def start_server():
    # Переходим в директорию с билдом
    os.chdir(current_dir / 'build')
    
    # Создаем handler для обработки запросов
    handler = http.server.SimpleHTTPRequestHandler
    
    # Запускаем сервер
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Сервер запущен на http://localhost:{PORT}")
        print("Для остановки сервера нажмите Ctrl+C")
        
        # Открываем браузер
        webbrowser.open(f"http://localhost:{PORT}")
        
        # Запускаем сервер
        httpd.serve_forever()

if __name__ == "__main__":
    try:
        start_server()
    except KeyboardInterrupt:
        print("\nСервер остановлен") 