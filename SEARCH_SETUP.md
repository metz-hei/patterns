# Настройка локального поиска в Docusaurus

## Что было сделано

### 1. Установка плагина
```bash
npm install @easyops-cn/docusaurus-search-local
```

### 2. Конфигурация в docusaurus.config.js

Добавлен плагин в секцию `plugins`:

```javascript
[
  '@easyops-cn/docusaurus-search-local',
  {
    hashed: true,
    language: ['ru', 'en'],
    highlightSearchTermsOnTargetPage: true,
    explicitSearchResultPath: true,
    searchBarPosition: 'right',
    indexPages: true,
    docsDir: 'docs',
    ignoreFiles: [],
  },
],
```

Добавлена кнопка поиска в навигацию:

```javascript
{
  type: 'search',
  position: 'right',
},
```

### 3. Параметры конфигурации

#### Основные параметры:
- `hashed: true` - хеширование индекса для кэширования
- `language: ['ru', 'en']` - поддержка русского и английского языков
- `highlightSearchTermsOnTargetPage: true` - подсветка найденных терминов на странице
- `explicitSearchResultPath: true` - явный путь к результатам поиска
- `searchBarPosition: 'right'` - позиция поисковой строки
- `indexPages: true` - индексация страниц
- `docsDir: 'docs'` - папка с документацией
- `ignoreFiles: []` - файлы для игнорирования

#### Дополнительные параметры для кастомизации:

```javascript
{
  // Горячие клавиши
  searchBarShortcut: true, // Ctrl+K для открытия поиска
  searchBarShortcutHint: true, // Показывать подсказку о горячих клавишах
  
  // Стили и поведение
  searchResultContextMaxLength: 50, // Максимальная длина контекста
  hideSearchBarWithNoSearchContext: false, // Скрывать поиск без контекста
  useAllContextsWithNoSearchContext: false, // Использовать все контексты
  
  // Пути и маршруты
  docsPluginIdForPreferredVersion: undefined, // ID плагина документации
  searchContextByPaths: null, // Контекст поиска по путям
}
```

### 4. Горячие клавиши

- `Ctrl+K` - открыть поиск
- `Escape` - закрыть поиск
- `Arrow keys` - навигация по результатам
- `Enter` - перейти к выбранному результату

### 5. Поддерживаемые языки

Плагин поддерживает:
- Русский язык (с морфологическим анализом)
- Английский язык
- Автоматическое определение языка

### 6. Производительность

- Индекс создается при сборке
- Поиск работает полностью оффлайн
- Минимальное влияние на размер бандла
- Быстрый поиск с использованием Lunr.js

## Тестирование

### Запуск сервера:
```bash
npm run build
npm run serve
```

### Открытие в браузере:
http://localhost:3000

### Тестовые запросы:
- "паттерны" (русский)
- "patterns" (английский)
- "дизайн" (русский)
- "design" (английский)
- "test" (английский)
- "тест" (русский)

## Структура файлов

После сборки создаются:
- `build/search-index.json` - индекс поиска
- `build/search/` - страница результатов поиска
- `build/assets/` - ресурсы поиска

## Устранение неполадок

### Если поиск не работает:

1. Проверьте, что плагин установлен:
```bash
npm list @easyops-cn/docusaurus-search-local
```

2. Проверьте конфигурацию в docusaurus.config.js

3. Пересоберите проект:
```bash
npm run build
```

4. Проверьте индекс поиска:
```bash
cat build/search-index.json
```

5. Проверьте консоль браузера на ошибки

### Если индекс пустой:

1. Убедитесь, что документы находятся в папке `docs/`
2. Проверьте, что документы имеют правильный формат Markdown
3. Убедитесь, что в документах есть контент для индексации

## Альтернативы

Если локальный поиск не подходит, можно рассмотреть:

1. **Algolia DocSearch** - облачный поиск (требует API ключ)
2. **Typesense** - самохостинг поиск
3. **Meilisearch** - быстрый поиск

## Заключение

Локальный поиск `@easyops-cn/docusaurus-search-local` является оптимальным решением для:
- Оффлайн работы
- Поддержки русского языка
- Минимального влияния на производительность
- Простой установки и настройки