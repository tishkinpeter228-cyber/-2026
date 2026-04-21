# RU Market Navigator — отдельное веб-приложение с входом через Google

Это не просто локальный HTML-файл, а отдельное приложение:
- фронтенд с вашим интерфейсом акций, металлов и Excel-отчётов,
- backend на Express,
- вход и регистрация через Google,
- серверный прокси к MOEX ISS, чтобы убрать проблемы браузера с прямыми запросами из локального файла.

## Что уже реализовано
- Вход через Google
- Создание пользователя при первом входе
- Сохранение пользовательской сессии на сервере
- Список крупных российских компаний
- История цены и MA(5)
- Онлайн-график за сегодня
- Таблица свечей
- Быстрые Excel-отчёты по неделям и месяцам
- Панель драгоценных металлов: золото, серебро, платина, палладий
- Экспорт CSV / JSON / watchlist

## Что нужно для запуска
- Node.js 20+
- Google Cloud OAuth Client ID для Web application

## Настройка Google входа
1. Откройте Google Cloud Console.
2. Создайте OAuth Client ID типа **Web application**.
3. Добавьте разрешённый origin:
   - `http://localhost:3000`
4. Скопируйте ваш `Client ID`.
5. Скопируйте файл `.env.example` в `.env`.
6. Вставьте значение в `GOOGLE_CLIENT_ID`.
7. Укажите длинный случайный `SESSION_SECRET`.

Пример `.env`:

```env
PORT=3000
GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com
SESSION_SECRET=replace_with_long_random_secret
TRUST_PROXY=0
```

## Локальный запуск
```bash
npm install
cp .env.example .env
npm start
```

После запуска откройте:

```text
http://localhost:3000
```

## Запуск через Docker
```bash
cp .env.example .env
# отредактируйте .env

docker compose up --build
```

## Структура проекта
```text
ru_market_google_app/
├── public/
│   ├── index.html
│   └── app.js
├── data/
│   └── users.json
├── server.js
├── package.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Как работает вход
- Пользователь нажимает кнопку Google
- Google возвращает ID token в браузер
- Браузер отправляет token на backend
- backend проверяет token через Google
- backend создаёт или обновляет пользователя
- backend создаёт сессионную cookie
- дальше приложение работает уже как отдельный сайт

## Важно
- В текущей версии используется `express-session` со стандартным хранилищем в памяти. Для боевого продакшена лучше заменить на Redis или database-backed session store.
- Профили пользователей сохраняются в `data/users.json`. Для production лучше использовать PostgreSQL или MySQL.
- Если приложение будет размещаться за reverse proxy или HTTPS, выставьте `TRUST_PROXY=1` и включите secure cookies.
