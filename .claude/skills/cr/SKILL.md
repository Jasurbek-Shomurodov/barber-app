---
name: cr
description: Deep code review of the uncommitted diff, a commit range, a branch or a PR in Barber (barber.vercel.app). Checks booking correctness and slot math, RLS and token-based client access, snapshots, Telegram security (HMAC, secrets, webhook auth), the notification queue, migrations, translations, loading states, network, performance and running cost. Arguments: empty or "full", "diff", a commit, "A..B", a branch, a PR number, a path, or an area code (SLOT, PROT, SNAP, TG, NOTIF, MIG, I18N, UI, NET, PERF, COST, DRY, TEST). Use when the user types /cr.
argument-hint: "[empty = full | diff | commit | A..B | branch | PR number | path | area code (SLOT, PROT, SNAP, TG, NOTIF, MIG, I18N, UI, NET, PERF, COST, DRY, TEST)] [fix]"
disable-model-invocation: true
---

# /cr: code review

> **Shared contract.** Load the `review-core` skill first (`~/.claude/skills/review-core/SKILL.md`). Its ground rules, argument
> grammar, S0/S1/S2 severity scale, report skeleton, fix mode and fan-out
> apply here. This file adds only what is specific to Barber.

Target: `$ARGUMENTS` (grammar in `review-core` section 1).

Sources of truth, read before every review: `AGENTS.md` (the invariants) and
`references/cases.md`, the code regression catalog. Every case has a Check and
an Expect; an area code as the target runs that area's cases across the whole
codebase. Keep the catalog alive per `review-core` section 6.

- Empty or `full`: the whole codebase. Fan out per `review-core` section 5
  with these groups: public booking (`ShopPage`, `BookingPage`, `slots.js`);
  dashboard (`src/pages/admin/*`, `stats.js`); data layer (`demoApi.js`,
  `supabaseApi.js`, `api/`); database (`migrations/`, `scripts/check-migrations.mjs`).
- `diff`: uncommitted changes (`git diff HEAD` plus untracked files). If the
  tree is clean, review the last commit.
- A commit, `A..B` range, or branch: `git diff` against it.
- A number: the GitHub PR (`gh pr view <n>`, `gh pr diff <n>`).
- A path or glob: those files plus their direct imports and callers.
- `fix` in the arguments: apply the confirmed fixes after the review
  (`review-core` section 4). Otherwise review only.

Read every changed file in full, plus callers and callees of every changed
function. Report only findings verified in the code, each with a concrete
failure scenario. No style nitpicks.

## Review passes

### 1. Intent
Does the change do what the commit, PR or request says, completely? Leftovers:
dead code, unused exports or translation keys, debug `console.log`.

### 2. Correctness
- Slot math: minutes vs labels, `step` loops, `duration` of several services,
  buffer applied on both sides, lead time only for today, `closed_dates`,
  the `now` object in the shop timezone (never `new Date()` local math).
- Both API layers (`demoApi.js`, `supabaseApi.js`) expose the same methods
  with the same shapes; the demo mirrors every SQL rule the UI relies on.
- React: stale closures, missing effect deps, state after unmount, list keys,
  stale responses when the shop, date or filter changes (`useAsync` run id).
- Async: unchecked Supabase `error`, partial failure leaving UI inconsistent,
  a double tap that books twice (button disabled while pending).

### 3. Project invariants (`AGENTS.md`)
1. Clients never read `bookings`; `get_busy` / `get_booking` carry no phone.
2. Availability and price are decided in SQL (`create_booking`); UI mirrors.
3. Booking snapshots (`service_names`, `total_price`, `duration_min`) are
   never rewritten; services archived, not deleted.
4. Notifications go through the `notifications` queue via triggers; cancelled
   bookings cancel pending reminders; every kind has `uz`/`ru`/`en` text.
5. No secret in `src/`; `api/` checks its secret before `supabaseAdmin()`;
   Telegram payloads verified by HMAC before use.
6. Shop-timezone `(date, start_min)` everywhere.
7. Language changes never refetch; `err_<code>` translated at render.
8. Shimmers, not spinners; no native dialogs; retryable `ErrorNote`.
9. Migrations append-only; `npm run sql:check` passes on PGlite.
10. Reads that can exceed 1000 rows page by `id`.

### 4. Security (TG area)
- `verifyLoginWidget` / `verify_telegram_login`: sorted data-check-string,
  SHA256(token) key, `auth_date` freshness, timing-safe compare.
- Webhook: `x-telegram-bot-api-secret-token` checked first; only `/start`
  payloads act; `b_` links update only `client_chat_id` of that booking; `s_`
  links match `telegram_link_code` exactly.
- `api/auth/telegram.js`: one Supabase user per Telegram id; the magic-link
  `token_hash` is returned, never a session for another user.
- RLS: every new table has policies; service-role-only tables
  (`telegram_clients`) have RLS enabled with no public policy; `(select auth.uid())`.

### 5. Tests
`node --test tests/<related>.test.js`, then `npm test`, `npm run sql:check`,
`npm run build`. A failing check is a finding. Does a source guard cover the
touched boundary (`tests/sourceGuards.test.js`), and was it weakened?

### 6. Network, performance and cost
- Waterfalls instead of `Promise.all`; refetching per render; `select('*')`
  on public paths; the 1000-row cap; `useAsync` ignoring stale results.
- Calendar polling interval vs real change rate; pg_cron every minute scanning
  only the `notifications_due_idx` slice; one `net.http_post` per message.
- Vercel: cold-start imports in `api/`, `CRON_SECRET` on cron routes.
- Heavy libraries (`qrcode`) imported with `import()`.

### 7. Cleanup, DRY and SOLID
Same markup, formula or query repeated across pages or both API layers;
components grown past one purpose; shared helpers in `src/lib` reused.

## Report
Use the skeleton from `review-core` section 3. Severity: **S0** = a client
can read another client's data, a double booking, a rewritten snapshot, a
secret in the bundle, an unverified Telegram identity trusted, a broken
check. **S1** = an invariant above broken or a real risk (race, unbounded
read, missed reminder cancellation, missing translation). **S2** =
maintainability.
