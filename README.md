# JARDAM4Y - MVP

Коротко: простой сайт для размещения заявок работодателей и просмотра вакансий студентами. Есть простая админ-панель.

Файлы:
- `server.js` - Node.js/Express сервер
- `db.js` - sqlite3 helper
- `public/` - фронтенд (HTML/CSS/JS)

Как запустить (Windows PowerShell):

1. Установить зависимости:

```powershell
cd "C:\Users\Admin\Desktop\JARDAM4Y"
npm install
```

2. Установить ключ администратора (необязательно, по умолчанию `secret_admin_key`):

```powershell
$env:ADMIN_KEY = 'мой_сильный_ключ';
npm start
```

Или запустить в режиме разработки с `nodemon`:

```powershell
npm run dev
```

3. Открыть в браузере: `http://localhost:3000`

Страницы:
- `/` - главная
- `/employer.html` - форма создания заявки
- `/vacancies.html` - список вакансий
- `/admin.html` - админ-панель (нужен ключ)

API:
- `POST /api/applications` - создать заявку (JSON)
- `GET /api/applications/public` - получить все заявки
- `GET /api/admin/applications` - получить все заявки (требует `x-admin-key` header или `adminKey` query)
- `GET /api/admin/export` - экспорт CSV (требует admin key)

Замечания и дальнейшие шаги:
- Улучшить авторизацию админа (сессии/пароли)
- Добавить подтверждение email/телефона
- Сделать личные кабинеты и фильтры
