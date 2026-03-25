# JARDAM4Y

Платформа для публикации вакансий и профилей исполнителей (Node.js + Express + SQLite).

## Запуск

```powershell
npm install
npm start
```

Откройте: `http://localhost:3000`

## Переменные окружения

- `PORT` — порт сервера (по умолчанию `3000`)
- `ADMIN_KEY` — ключ админа (обязательно для `/api/admin/*`)
- `SEARCH_UI_V2` — включение нового поиска (`1`/`true` = включен, по умолчанию включен)
- `BCRYPT_ROUNDS` — стоимость bcrypt (по умолчанию `12`)

Пример:

```powershell
$env:ADMIN_KEY = 'super_secret_key'
$env:SEARCH_UI_V2 = '1'
npm start
```

Сборка React-поиска (v2):

```powershell
npm run build:search-v2
```

## Основные страницы

- `/` — главная
- `/vacancies` — поиск вакансий (v2/legacy по feature flag)
- `/profiles` — поиск исполнителей (v2/legacy по feature flag)
- `/vacancy-form.html` — создание/редактирование вакансии
- `/profile-form.html` — создание/редактирование профиля
- `/dashboard.html` — личный кабинет заявок
- `/auth.html` — вход/регистрация
- `/admin.html` — админ-панель

## API (ключевое)

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`

### Search API (новый формат)

`GET /api/vacancies` и `GET /api/profiles` возвращают:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "facets": {},
  "sort": { "sortBy": "createdAt", "sortOrder": "desc" }
}
```

Поддерживаются параметры:

- `page`, `pageSize`
- `sortBy`, `sortOrder`
- `query`, `category/categories`, `availability/schedule`, `payMin`, `payMax`, `city`, `location`, `date`, `flexibleOnly`
- `filters` (JSON-объект)

Для временной совместимости:

- `legacy=1` => старый формат (массив)

## Безопасность

- Пароли: `bcrypt` (с мягкой миграцией старых SHA-256 хешей при логине)
- Сессии: токен в `x-session-token`
- Админ-доступ: только через `ADMIN_KEY`
