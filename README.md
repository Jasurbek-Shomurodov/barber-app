# Navbat — online booking for barbers

Clients open the barber's link (`/your-shop`), pick services, a day and a free time, and
book in seconds. The barber manages everything at `/admin`: calendar, services, clients
and stats, feedback and settings. One deployment serves many barbers — each gets their
own shop and link.

## Run

```bash
npm install
npm run dev      # http://localhost:5180
npm test
```

Without Supabase keys the app runs in **demo mode**: a sample shop at `/demo`, data kept
in the browser's localStorage, and `/admin` signs straight in.

## Connect Supabase

1. Create a Supabase project and run `migrations/001_init.sql` in the SQL editor.
2. Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Open `/admin`, create an account, then create the barbershop and its link.

## How it fits together

| Part | Where |
| --- | --- |
| Routes | `src/App.jsx` — `/`, `/:slug` (booking), `/b/:token` (client's booking + feedback), `/admin/*` |
| Free-time and duration math | `src/lib/slots.js` (tested) |
| Client and service stats | `src/lib/stats.js` (tested) |
| Data layer | `src/lib/api.js` picks `supabaseApi.js` or `demoApi.js` (same functions) |
| Database, RLS, RPCs | `migrations/001_init.sql` |
| Translations (O'zbek, Русский, English) | `src/lib/i18n.jsx` |

Rules the database enforces:

- Clients never read the bookings table; they get busy times (no names or phones) via `get_busy` and their own booking via its secret token.
- Duration and price are computed from the services table in `create_booking`, never trusted from the browser.
- Two live bookings of a shop can never overlap (exclusion constraint) — a race returns `slot_taken`.
- Feedback is allowed once per visit, only after it started.
- Service names and prices are snapshotted on each booking; removing a service archives it.
