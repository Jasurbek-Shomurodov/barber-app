# Barber Agent Guide

Barber (barberuz.vercel.app) is a Vite/React 18 booking site for barbers on Supabase: a public
booking page per shop, a barber dashboard (calendar, services, clients, feedback, settings)
and Telegram login, notifications and reminders. One deployment serves many shops.

Three roles: the **platform admin** (rows in `platform_admins`, only the site owner) approves and
suspends barbers at `/owner`; a **barber** is a user who owns a shop (new shops start `pending`,
hidden from clients); a **client** is any other signed-in user, whose bookings are listed at `/me`.
Booking without an account still works.

## Map

| Area | Where |
| --- | --- |
| Routes | `src/App.jsx`: `/` landing, `/:slug` booking, `/b/:token` client's booking + feedback, `/admin/*` dashboard, `/owner` admin panel, `/me` client's bookings |
| Roles | `migrations/005_roles.sql` (`platform_admins`, `shops.status`, `shops_guard`, `admin_*` RPCs, `my_bookings`), `src/pages/owner/OwnerApp.jsx`, `src/pages/MyBookings.jsx` |
| Slot and duration math | `src/lib/slots.js` (buffer, closed dates, lead time) |
| Client and service stats | `src/lib/stats.js` |
| Data layer | `src/lib/api.js` → `supabaseApi.js`; without `VITE_SUPABASE_*` the app shows a setup message |
| Translations | `src/lib/i18n.jsx`: `uz`, `ru`, `en`; `t`, `tf`, money and date formatters |
| Theme | `src/index.css` tokens (same cream/copper kit as zarkebab.uz), `src/components/ui.jsx` |
| Database, RLS, RPCs, triggers | `migrations/*.sql` (append-only, numbered) |
| Sign-in | `src/components/AuthDialog.jsx`, a dialog on the landing page (`/?auth=in` or `up`, `&as=client` for clients; signed-out `/admin`, `/owner`, `/me` redirect there): phone + password (`src/lib/phoneLogin.js`, `api/auth/phone-signup.js`) or the bot (`api/auth/telegram-bot.js`, `/start l_<code>` in the webhook). No email sign-in |
| Telegram | `api/_lib/telegram.js`, `api/auth/telegram.js` (widget login, client page), `api/telegram/webhook.js` (deep links, login confirm buttons), `api/telegram/dispatch.js` (queue fallback), `src/lib/telegram.js` |
| Tests | `tests/*.test.js` (`npm test`), `scripts/check-migrations.mjs` (`npm run sql:check`, PGlite) |

```bash
npm run dev        # http://localhost:5180, needs .env.local with VITE_SUPABASE_URL/ANON_KEY
npm test
npm run sql:check
npm run build
```

## Invariants

- **Clients never read `bookings`.** They get busy intervals (no names/phones) via `get_busy`, their own booking through its secret token (`get_booking`), and, signed in, the bookings linked to their account (`my_bookings`, by `client_user_id`, never by phone). None of these return `client_phone`.
- **Only the platform admin changes `shops.status`** (`shops_guard`; `admin_*` RPCs check `is_platform_admin()`). Unapproved shops are invisible to clients and `create_booking`/`join_waitlist` reject them.
- **Nothing starts in the past.** `bookings_not_in_past` rejects any insert before the running slot; the calendar mirrors it with `isPastStart`.
- **The database decides availability.** Duration and price come from `services` inside `create_booking`; the exclusion constraint plus the buffer check reject overlaps; working hours, closed dates, lead time, booking window, blocked clients and cancellation hours and shop approval are enforced in SQL. The browser mirrors the rules in `slots.js` only to show free times.
- **Booking history is a snapshot.** `service_names`, `total_price`, `duration_min` are copied at booking time; renaming or repricing a service never rewrites them. Services are archived, never deleted.
- **Notifications are a queue, not a side effect in the UI.** Triggers on `bookings` enqueue `notifications`; `dispatch_notifications()` (pg_net + pg_cron) or `api/telegram/dispatch.js` sends them. Cancelling a booking cancels its pending reminders. New kinds get a template in `notification_text()` for `uz`, `ru`, `en`.
- **Secrets live server-side.** `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` only in `api/` and Vault. Telegram login payloads are verified by HMAC (`verifyLoginWidget` or `verify_telegram_login` in SQL) before being trusted. Bot sign-in hands a session only to the browser holding the request's secret (only its sha256 is stored), once, within `BOT_LOGIN_TTL_MS`; `telegram_login_requests` has RLS and no policies. `api/` handlers check their secret before touching the admin client.
- **Times are (date, start_min) in the shop's timezone.** Never store or compare browser-local instants; use `nowInZone`, `booking_starts_at`.
- **Language changes are presentation only.** No refetch, reload or form reset; error codes are translated at render time (`err_<code>`); every key exists in all three dictionaries (`tests/i18n.test.js`).
- **Loading shows content-shaped shimmers**, never spinners or loading text; no `alert()`/`confirm()`; errors are visible and retryable (`ErrorNote`).
- **Migrations are append-only.** New SQL goes in the next numbered file; `npm run sql:check` must pass on PGlite (guard pg_net/pg_cron/vault with `pg_available_extensions`).
- **PostgREST caps selects at 1000 rows.** Unbounded booking reads page by `id` (`pagedBookings`).

## Review skills

`/cr`, `/qa`, `/dr` live in `.claude/skills/` and share the `review-core` contract. Their `references/cases.md` catalogs are regression lists: append cases from findings, never renumber.

## Validation

Smallest related test first, then `npm test`, `npm run sql:check`, `npm run build`. When a change alters an invariant, route, RPC contract or notification kind, update this file and the relevant catalog in the same change.
