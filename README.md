# Barber — online booking for barbers

Live: `https://barber.vercel.app`. Clients open the barber's link (`/your-shop`), pick
services, a day and a free time, and book in seconds — with Telegram confirmations and
reminders. The barber manages everything at `/admin`: calendar, services, clients and
stats, feedback and settings. One deployment serves many barbers.

## Features

- Public booking page: services grouped by category with duration and price, free times
  only (working hours, closed dates, buffer, lead time, booking window), waitlist for full
  days, reviews and headline numbers (clients served, rating), Instagram / Telegram / map links.
- Client page by secret link: details, free cancellation until the deadline, Telegram
  reminders, "book the same again", feedback after the visit.
- Dashboard: day/week calendar with walk-ins and blocked time, services, clients (visits,
  revenue, no-show rate, busiest hours, private notes, blocking, CSV), feedback moderation,
  settings with QR code and share link.
- Telegram: barber sign-in with the Login Widget, bot deep links that connect the barber's
  chat and the client's chat, queue-based notifications (new booking, cancellations,
  reminders, review request, slot freed for the waitlist, morning summary).
- Three languages (O'zbek, Русский, English), light and dark theme, phone-first.

## Run

```bash
npm install
npm run dev        # http://localhost:5180
npm test
npm run sql:check  # applies migrations to an in-memory Postgres and exercises the RPCs
```

Without Supabase keys the app runs in **demo mode**: a sample shop at `/demo`, data in the
browser's localStorage, `/admin` signs straight in, Telegram actions are simulated.

## Deploy (Vercel + Supabase + Telegram)

1. Supabase: create a project, run `migrations/001_init.sql` then `002_telegram_and_policies.sql`.
   Store the bot token: `select vault.create_secret('<token>', 'telegram_bot_token');`
   (pg_cron then sends notifications every minute via pg_net).
2. Telegram: create a bot with @BotFather, `/setdomain barber.vercel.app` for the Login
   Widget, and register the webhook:
   `curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://barber.vercel.app/api/telegram/webhook&secret_token=$SECRET"`.
3. Vercel: import the repo, set the env vars from `.env.example`
   (`VITE_*` for the browser; `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET` server-only). `vercel.json` rewrites the SPA
   and runs a daily queue flush as a fallback.

See `AGENTS.md` for the code map and invariants.
