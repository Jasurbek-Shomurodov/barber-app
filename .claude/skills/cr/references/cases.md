# Code regression catalog (Barber)

Severity if failed (`review-core` section 2): **S0** another client's data readable, a double booking, a rewritten snapshot, a secret in the bundle, an unverified Telegram identity trusted, a broken check; **S1** an `AGENTS.md` invariant broken or a real risk; **S2** maintainability. IDs are stable; append, never renumber. `[cr YYYY-MM-DD]` marks a case added from a finding; `Fixed YYYY-MM-DD` plus the guarding test closes it.

## Run log (newest first; `retest` starts from the top row)

| Date | Commit | Scope | Findings (S0/S1/S2) | Checks run | Not run |
|---|---|---|---|---|---|

## SLOT — availability math

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| SLOT-001 | S0 | SQL rejects overlaps even under a race | Read `bookings_no_overlap` in `001` and the `exclusion_violation` handler in `create_booking` | Exclusion constraint on `(shop_id, date, int4range)` where status <> cancelled; error mapped to `slot_taken` |
| SLOT-002 | S0 | Duration and price come from `services`, not the client | Read `create_booking` | `sum(duration_min)`, `sum(price)` from active, non-archived services; mismatched ids raise `service_unavailable` |
| SLOT-003 | S1 | Buffer applied on both sides in SQL and JS | `rg -n "buffer" migrations src/lib/slots.js` | `int4range(start - buffer, end + buffer)` in SQL; `b.start_min - bufferMin` and `+ bufferMin` in `availableStarts` |
| SLOT-004 | S1 | Lead time applies to today only; past days closed | Read `availableStarts` and `create_booking` | `earliest` only when `date === now.date`; `date < now.date` → `[]` / `date_out_of_range` |
| SLOT-005 | S1 | Closed dates and days off agree between UI and SQL | `rg -n "closed_dates" src migrations` | `isClosed` in UI; `p_date = any(closed_dates)` → `outside_hours` in SQL |
| SLOT-006 | S1 | The UI shows only times SQL accepts | Compare `availableStarts` + `slotOptionsFor` with SQL `create_booking` | closed date, buffer, lead, window and hours agree |

## PROT — client data stays private

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| PROT-001 | S0 | `get_busy` returns intervals only | Read `get_busy` | Columns `date, start_min, duration_min` only |
| PROT-002 | S0 | `get_booking` never returns the phone or chat id | Read latest `get_booking`; `tests/sourceGuards.test.js` | No `client_phone`, no `client_chat_id` in the jsonb |
| PROT-003 | S0 | Anonymous callers cannot select `bookings` | `rg -n "policy.*bookings" migrations` | Only `bookings_owner_all`; no anon select policy |
| PROT-004 | S1 | Service-role-only tables have RLS on and no public policy | `rg -n "telegram_clients" migrations` | `enable row level security` with no `create policy` |
| PROT-005 | S1 | Owner policies use `(select auth.uid())` | `rg -n "auth.uid()" migrations/002*` | Wrapped in `(select ...)` for per-query evaluation |

## SNAP — booking snapshots and archival

| ID | Sev | Case | Case | Expect |
|---|---|---|---|---|
| SNAP-001 | S0 | Service rename/reprice never touches bookings | `rg -n "update bookings" migrations src` | Only `status`, `client_chat_id` updated; never `service_names`, `total_price`, `duration_min` |
| SNAP-002 | S1 | Services archived, not deleted | `rg -n "\.delete\(" src/lib/supabaseApi.js` | No delete on `services`; `archived = true` |

## TG — Telegram security

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| TG-001 | S0 | Login widget verified with HMAC before any DB write | Read `api/auth/telegram.js`, `tests/telegram.test.js` | `verifyLoginWidget` runs before `supabaseAdmin()`; tampered, foreign-token and stale payloads throw |
| TG-002 | S0 | SQL verification uses the Vault token or trusts nothing | Read `verify_telegram_login` | `telegram_bot_token()` null → return null; sorted `key=value` check string; `hmac(..., digest(tok,'sha256'))` |
| TG-003 | S0 | Webhook checks the secret header first | Read `api/telegram/webhook.js` | `x-telegram-bot-api-secret-token` compared before `supabaseAdmin()` |
| TG-004 | S1 | Deep links touch only their own row | Read `b_` / `s_` branches | `b_` updates `client_chat_id` by exact `token`; `s_` by exact `telegram_link_code` |
| TG-005 | S1 | No bot token or admin key reachable from `src/` | `tests/sourceGuards.test.js` | Guard passes; `VITE_` holds only the bot username |

## NOTIF — notification queue

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| NOTIF-001 | S1 | Cancelling a booking cancels pending reminders | `scripts/check-migrations.mjs` | Reminder rows → `cancelled`; `client_cancelled` or `barber_cancelled` enqueued by who cancelled |
| NOTIF-002 | S1 | Reminders scheduled only in the future | Read `bookings_notify_trigger` | `booking_starts_at - h hours > now() + 10 min` |
| NOTIF-003 | S1 | Every kind has uz/ru/en text | Read `notification_text` | `case p_lang when 'en' ... when 'uz' ... else` per kind |
| NOTIF-004 | S1 | Dispatcher scans the due slice only | Read `claim_notifications`, `notifications_due_idx` | Partial index on `send_after where status = 'pending'`; `for update skip locked` |
| NOTIF-005 | S2 | Telegram HTML escaped | `rg -n "tg_escape" migrations` | Names, notes, services and addresses pass through `tg_escape` |

## MIG — migrations

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| MIG-001 | S0 | `npm run sql:check` passes | Run it | `migrations ok` |
| MIG-002 | S1 | Append-only numbering | `tests/sourceGuards.test.js` | `001_`, `002_`, … |
| MIG-003 | S1 | Optional extensions guarded | `rg -n "pg_available_extensions" migrations` | pg_net, pg_cron, vault behind checks so PGlite applies the file |

## I18N / UI

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| I18N-001 | S1 | Key parity across dictionaries | `tests/i18n.test.js` | Passes |
| I18N-002 | S1 | Language switch never refetches | `rg -n "lang" src/lib/useAsync.js src/pages` | `lang` not in any `useAsync` deps |
| UI-001 | S1 | No spinners, loading text or native dialogs | `tests/sourceGuards.test.js` | Passes |
| UI-002 | S1 | Heavy libs lazy | `rg -n "qrcode" src` | `import('qrcode')` only |

## NET / PERF / COST

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| NET-001 | S1 | Owner booking reads page past 1000 rows | Read `pagedBookings` | `.range(offset, offset + 999)` loop ordered by `id` |
| NET-002 | S2 | Calendar refresh interval reasonable | `rg -n "setInterval" src` | 60 s or longer |
| COST-001 | S2 | Cron work bounded | Read `dispatch_notifications`, `enqueue_daily_summaries` | `limit 50`; summary once per shop per day |
