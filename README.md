# Как присоединиться к команде паттернов

1. Завести аккаунт [на Гитхаб](https://github.com/)
2. Скачать и установить [VS Code](https://code.visualstudio.com/)
3. Скачать и установить [Node](https://nodejs.org/en/download/prebuilt-installer)
4. Скачать и установить git:
   - если вы [на MacOS](https://developer.apple.com/xcode/), то git встроен в Xcode
   - если вы [на Windows](https://git-scm.com/downloads/win)
5. Открыть VS Code и клонировать проект на свой компьютер: ```git clone https://github.com/metz-hei/patterns.git```
6. Изменить директорию терминала на psb: ```cd patterns```
7. Установить зависимости: ```npm i```
8. Запустить проект: ```npm start```

## Проект не запускается

Если у вас уже был развёрнут проект и он перестал запускаться после очередного обновления, то попробуйте почистить кэш:

- выполнить команду `npm cache clean --force`,
- удалить папку node_modules,
- удалить файл package-lock.json,
- установить зависимости `npm i`,
- запустить проект `npm start`.

## Как создать сборку и запустить документацию локально

1. Создать zip-архив сборки

   ```bash
   zip -r build.zip build/
   ```

2. Отправить архив другу
3. Разархивировать
4. Если у вас MacOS, то запустить терминал по адресу папки и выполнить запрос

   ```bash
   (python3 -m http.server 8000 &) && sleep 1 && open http://localhost:8000
   ```

5. Если у вас Windows, то...

   ```cmd
   start /b python3 -m http.server 8000 && timeout /t 1 && start http://localhost:8000
   ```
