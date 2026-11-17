# Dental Clinic — Telegram Mini App & SaaS-платформа стоматологии

Веб-платформа и **Telegram Mini App** для стоматологических клиник: личный кабинет пациента, онлайн-запись с проверкой занятости слотов и подтверждением через Telegram-бота, рабочее место врача, административная панель клиники и мультитенантное управление на базе **Next.js 15 (App Router)** и **Supabase**.

---

## Основные возможности

### 1. Личный кабинет пациента (`/screens/03_Main`, `/appointments`, `/bills`, `/cabinet`, `/booking`)
- **Авторизация и вход**: Telegram Mini App (`initData`) + вход по телефону/OTP, быстрый PIN-код для повторного входа.
- **Главная страница (`/screens/03_Main`)**: карточка ближайшего визита, быстрый доступ к ключевым разделам, навигация между вкладками.
- **Онлайн-запись (`/booking`)**: выбор услуги, врача, даты и времени с реальной блокировкой уже занятых слотов (`/api/appointments/booked`) и мгновенным пересчётом при подтверждении или отмене.
- **Интеграция с Telegram-ботом**: после создания записи бот отправляет уведомление с кнопками **«Подтверждаю»** и **«Отменить»** (`/api/telegram/webhook`):
  - подтверждение фиксирует запись, отправляет ответное сообщение в чат бота, оставляет слот занятым и уведомляет врача;
  - отмена удаляет/отменяет запись в Mini App, отправляет подтверждение отмены в бот, освобождает дату и время для новой записи и отправляет уведомление врачу.
- **Мои записи (`/appointments`)**: список предстоящих и прошедших визитов, детали приёма, перенос и отмена.
- **Счета и оплаты (`/bills`)**: распределение по вкладкам **«Ожидают»** и **«История»** (оплаченные внутри истории), карточка **налогового вычета**, история транзакций и эквайринг.
- **Компактный Кабинет (`/cabinet`)**: единый хаб разделов — **Зубная формула** (`/formula`, `/tooth/[id]`), **План лечения** (`/treatment-plan`), **История лечения** (`/treatment-history`), **Документы и снимки** (`/documents`), **Профилактика** (`/prevention`), **Профиль и настройки** (`/profile`), **Врачи** (`/doctors`), **Прайс-лист** (`/price-list`), **Контакты** (`/contacts`), **Чат поддержки** (`/screens/support-chat`).
- **Онлайн-консультации (`/consultation/[appointmentId]`)**: встроенная видеоконсультация на WebRTC.
- **Оптимизация отклика**: SWR-кэширование в `lib/*`, дедупликация параллельных запросов, синхронная гидрация кэша до отрисовки и фоновая предзагрузка данных/маршрутов при старте приложения.

### 2. Кабинет врача (`/screens/doctor/cabinet`, `/screens/doctor/messages`)
- Календарь и расписание приёмов, отображение статусов подтверждения/отмены от пациентов и уведомления об изменениях.
- Медицинская карта пациента (`PatientMedicalSheet`), зубная формула, планы лечения, история визитов и файлы/снимки.
- Чат ординаторской и переписка с пациентами.

### 3. Панель администратора клиники (`/screens/admin/*`)
- Дашборд клиники, KPI-аналитика и графики (`Recharts`).
- Управление врачами, прайс-листом, расписанием, финансами/кассой, CRM-кампаниями, сообщениями, настройками брендинга и журналом аудита.

### 4. SaaS / Platform Super-Admin (`/screens/platform/*`)
- Мультитенантность по `CLINIC_SLUG`, подключение и онбординг новых клиник, управление тарифами и мониторинг платформы.

---

## Технологический стек

- **Фреймворк**: Next.js 15.3 (App Router), React 19, TypeScript (`strict`)
- **Стилизация и UI**: Tailwind CSS v4, Lucide React, Recharts
- **База данных и Auth**: Supabase (PostgreSQL, Row Level Security, RPC, Storage, Realtime)
- **Интеграции**: Telegram Bot API + Telegram Mini App SDK, WebRTC, Vercel Cron (`/api/cron/*`)

---

## Структура проекта

```text
.
├── app/                      # Next.js App Router: маршруты, layouts, стили и API (/app/api/*)
│   ├── api/                  # REST & webhook endpoints (auth, appointments, telegram, crm, cron, payments...)
│   ├── (patient routes)/     # Страницы пациента: appointments, bills, booking, cabinet, formula, tooth...
│   ├── screens/              # Маршруты экранов (03_Main, doctor/*, admin/*, platform/*, support-chat)
│   ├── globals.css           # Глобальные стили Tailwind CSS v4 и темы (light / dark)
│   └── layout.tsx            # Корневой layout и провайдеры
├── components/               # Переиспользуемые UI-компоненты (auth, chat, consultation, dental, layout, admin, platform, ui)
├── contexts/                 # React Context: AuthContext, ClinicProvider
├── hooks/                    # Пользовательские хуки (слоты, счётчики, тосты, тема и др.)
├── lib/                      # Клиентские и серверные модули, SWR-кэши, Supabase, роутинг, WebRTC
├── screens/                  # Экранные модули по ролям и шагам интерфейса
├── supabase/                 # SQL-миграции (001–013) и demo seed-скрипты
├── types/                    # Общие TypeScript-типы
├── docs/                     # Документация проекта, аудиты и описание демо-стенда
├── public/                   # Статические файлы и PWA-манифест
├── .env.example              # Шаблон обязательных переменных окружения
├── .env.demo.example         # Шаблон переменных для изолированного демо-стенда
├── next.config.ts            # Конфигурация Next.js, оптимизация импортов и редиректы
├── vercel.json               # Расписание Vercel Cron (напоминания о приёмах и CRM-кампании)
└── package.json              # Скрипты и зависимости проекта
```

---

## Быстрый старт

### 1. Установка зависимостей
```bash
npm install
```

### 2. Настройка переменных окружения
Создайте файл `.env.local` на основе `.env.example` и заполните ключи:
```bash
cp .env.example .env.local
```

Основные переменные:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — подключение к проекту Supabase.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MINI_APP_URL`, `TELEGRAM_WEBHOOK_SECRET` — токен бота, URL Mini App и секрет проверки Telegram webhook.
- `NEXT_PUBLIC_SITE_URL`, `APP_URL`, `CLINIC_SLUG`, `NEXT_PUBLIC_CLINIC_SLUG` — базовый URL приложения и slug клиники.
- `CRON_SECRET` — защита cron-маршрутов `/api/cron/*`.

> Никогда не добавляйте `.env.local` и реальные токены в Git.

### 3. База данных (Supabase)
Примените SQL-миграции из `supabase/migrations/` в порядке `001_master.sql` → `013_appointment_service_fields.sql`.
При необходимости развернуть тестовые данные используйте скрипты `supabase/seed_*.sql` (подробнее в `docs/DEMO_STAND.md`).

### 4. Запуск в разработке и сборка
```bash
# Локальный запуск (порт 3000)
npm run dev

# Проверка типов, ESLint и production-сборка
npm run lint
npm run build
npm run start
```
