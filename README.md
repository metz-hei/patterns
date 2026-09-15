# Как присоединиться к команде паттернов

1. Завести аккаунт [на Гитхаб](https://github.com/)
2. Скачать и установить [VS Code](https://code.visualstudio.com/)
3. Скачать и установить [Node](https://nodejs.org/en/download/prebuilt-installer)
4. Скачать и установить git:
   - если вы [на MacOS](https://developer.apple.com/xcode/), то git встроен в Xcode
   - если вы [на Windows](https://git-scm.com/downloads/win)
5. Открыть VS Code и клонировать проект на свой компьютер: ```git clone https://github.com/metz-hei/patterns.git```
6. Изменить директорию терминала на patterns: ```cd patterns```
7. Установить зависимости: ```npm i```
8. Запустить проект: ```npm start```

## Авторизация

Сайт закрыт шестизначным кодом, как на ds.mihailshamin.ru. Главная тоже закрыта.
Доступ проверяется на сервере: без валидной сессии HTML, JS и assets не отдаются.

Сессия хранится в HttpOnly-cookie и действует 365 дней с момента входа.

### Локально

1. Создайте `.env` и заполните MySQL.
2. Создайте `.env.local` для локальной разработки (переопределяет `.env`).
3. Задайте `AUTH_ADMIN_PASSWORD` для администратора.
4. Создайте пользователей: `npm run seed:users`
5. Обновите схему БД: `npm run migrate:schema`
6. Запуск: `npm start` или после сборки `npm run serve`

Пример `.env.local`:

```env
APP_ENV=development
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=patterns
```

### Синхронизация пользователей из `backups/users.tsv`

Отредактируйте `backups/users.tsv` (формат: `login<TAB>password`, первая строка — заголовок) и выполните:

- **Локально:** `npm run sync:users` — использует `.env` + `.env.local`
- **На сервере:** `npm run sync:users:remote` — откроет SSH-туннель и обновит `u1526758_patterns`

Скрипт обновляет пользователей по `login`: существующие `id` и сессии сохраняются. Сессии сбрасываются только у логинов, которых больше нет в TSV.

API входа работает на том же порту, что и сайт. На хостинге запросы обрабатывает PHP.

### Деплой на REG.RU

1. Соберите сайт: `npm run build`
2. Задеплойте: `npm run deploy`
3. Положите `.env` **вне** document root. Рекомендуемый путь — рядом с каталогом сайта, с именем по домену:

   ```bash
   scp .env u1526758@31.31.196.170:/var/www/u1526758/data/www/zdesbildizain.ru.env
   ```

   Так файл не пересечётся с `.env` других сайтов аккаунта и останется снаружи web-root.
4. Проверьте, что сервер его видит: `npm run env:check`. Команда ищет `.env` по списку
   и предупреждает, если файла нет или он лежит внутри document root.
5. Обновите схему БД: `npm run migrate:schema` или пересоздайте пользователей через `npm run seed:users`

Порядок поиска `.env` (`static/api/_bootstrap.php`, функция `env_candidates()`), от приоритетного к запасному:

| Путь | Комментарий |
| --- | --- |
| `<docroot>/.env` | внутри web-root, только для обратной совместимости |
| `<www>/<домен>.env` | **рекомендуется**: `/var/www/u1526758/data/www/zdesbildizain.ru.env` |
| `<www>/.env` | общий для сайтов в `www/` |
| `<data>/<домен>/.env` | приватный каталог сайта: `/var/www/u1526758/data/zdesbildizain.ru/.env` |
| `<data>/.env` | общий для всего аккаунта: `/var/www/u1526758/data/.env` |
| `<docroot>/private/.env` | внутри web-root |
| `<docroot>/api/config.local.php` | PHP-массив вместо `.env`, внутри web-root |

`backups/`, `*.sql`, `*.tsv` и `.env` не должны попадать в Git или web-root.

S3-деплой (`scripts/deploy-s3.sh`) несовместим с закрытым сайтом: PHP-авторизация на static hosting не работает.

## Проект не запускается

Если у вас уже был развёрнут проект и он перестал запускаться после очередного обновления, то попробуйте почистить кэш:

- выполнить команду `npm cache clean --force`,
- удалить папку node_modules,
- удалить файл package-lock.json,
- установить зависимости `npm i`,
- запустить проект `npm start`.

## Как добавить к документации сборку Storybook или обновить ее

1. Скачать последний билд из канала WEB Storybooks в Element
2. Создать в папке static папку storybook и перенести в нее содержимое билда:
   ![Сборка Storybook](./static/img/storybook.png)
3. Теперь можно сделать билд документации `npm run build` и Storybook скопируется туда автоматически
4. Запустить проект `npm run serve`

## Как создать сборку для локального запуска

1. Сделать свежий билд

   ```bash
   npm run build
   ```

2. Билд мы отправляем в Элемент, но он пропускает файлы до 10 Мб, поэтому нужно разбить билд на архивы. Логично бить не проект целиком, а самые тяжелые его части, а это картинки, которые хранятся `build/assets/images`:

   <!-- markdownlint-disable MD013 -->
   ```bash
   cd /Users/michaelshamin/patterns && rm -f images_*.zip; LIMIT=$((9*1024*1024)); idx=1; sum=0; files=(); mkdir -p split_zip_tmp >/dev/null 2>&1; rm -f split_zip_tmp/filelist.txt; for f in build/assets/images/*; do [ -f "$f" ] || continue; sz=$(stat -f %z "$f"); if [ $sum -gt 0 ] && [ $((sum + sz)) -gt $LIMIT ]; then printf "%s\n" "${files[@]}" > split_zip_tmp/filelist.txt; printf -v zipname "images_%03d.zip" "$idx"; zip -9 -q -j -@ "$zipname" < split_zip_tmp/filelist.txt; idx=$((idx+1)); sum=0; files=(); fi; files+=("$f"); sum=$((sum + sz)); done; if [ ${#files[@]} -gt 0 ]; then printf "%s\n" "${files[@]}" > split_zip_tmp/filelist.txt; printf -v zipname "images_%03d.zip" "$idx"; zip -9 -q -j -@ "$zipname" < split_zip_tmp/filelist.txt; fi; rm -rf split_zip_tmp; ls -lh images_*.zip | cat
   ```
   <!-- markdownlint-enable MD013 -->

3. Система создаст несколько архивов с картинками и положит их в корень проекта.
4. Вынести архивы их корня на рабочий стол. Это первая часть файлов, которые мы отправим в Элемент.
5. Удалить содержимое папки `build/assets/images`.
6. Сделать архив со всем остальным

   ```bash
   zip -r build.zip build/
   ```

7. Отправить все архивы в канал паттернов в Элементе.

## Как запустить документацию локально

1. Скачать все архивы из Элемента
2. Разархивировать build.zip
3. Открыть разархивированную папку и перейти `assets/images`
4. Разархивировать в эту папку архивы с картинками
5. Если у вас MacOS, то запустить терминал по адресу папки и выполнить запрос

   ```bash
   python3 -m http.server 9000 & sleep 2 \
     && echo "Server started on port 9000" \
     && open http://localhost:9000
   ```

   Если возникла ошибка при повторном запуске сервера, то выполните команду:

   ```bash
   kill $(lsof -t -i:9000)
   ```

6. Если у вас Windows:

   ```cmd
   start "" /b python3 -m http.server 9000 & timeout /t 2 >nul ^
     & echo Server started on port 9000 ^
     & start "" http://localhost:9000
   ```
