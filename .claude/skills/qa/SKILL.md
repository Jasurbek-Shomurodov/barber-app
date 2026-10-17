---
name: qa
description: Thorough functional QA of a feature, page, request or recent change in Barber (barberuz.vercel.app). Tests the real app end to end in the browser (booking flow, slots, cancellation policy, waitlist, feedback, dashboard calendar/services/clients/settings, Telegram linking, locales, themes, phone sizes) and reports pass/fail with evidence. Arguments: empty or "full", "diff", a feature, page or request text, a commit, a PR, "smoke", "retest", or an area code (BOOK, SLOT, CANCEL, FEED, CAL, SVC, CLI, SET, TG, I18N, UI). Use when the user types /qa.
argument-hint: "[empty = full | diff | feature, page or request text | commit | PR | smoke | retest | area code (BOOK, SLOT, CANCEL, FEED, CAL, SVC, CLI, SET, TG, I18N, UI)] [fix]"
disable-model-invocation: true
---

# /qa: functional QA

> **Shared contract.** Load the `review-core` skill first (`~/.claude/skills/review-core/SKILL.md`). Its ground rules, argument
> grammar, S0/S1/S2 severity scale, report skeleton, fix mode and fan-out
> apply here. This file adds only what is specific to Barber.

Target: `$ARGUMENTS` (grammar in `review-core` section 1). Empty or `full`
means every page and the whole checklist; `diff` means whatever the
uncommitted diff (or else the last commit) changed; a feature, page or
request text means that flow end to end; `smoke` runs only the S0 scenarios
(book, no double booking, cancel, feedback once, phone never public).

Sources of truth: `AGENTS.md` and `references/cases.md`, the QA regression
catalog. An area code runs that area's cases; `smoke` every S0 case;
`retest` starts from the top row of the run log.

Prove the app works for a client on a phone and a barber at the mirror, or
find exactly where it does not. Default to **report only**; fix only with
`fix` in the arguments or after asking at the end.

## 1. Understand what "correct" means
1. Restate the request: what the client or barber should be able to do.
2. Find the change: `git status`, `git diff`, `git log -5 --stat`, PR.
3. Trace the path: page → `api.js` method → `demoApi.js` and
   `supabaseApi.js` → SQL function/trigger → rendering. Write the expected
   values **before** looking at the screen.
4. Migration involved? `npm run sql:check` first.

## 2. Automated checks
```bash
node --test tests/<related>.test.js
npm test
npm run sql:check
npm run build
```

## 3. Environment
- Without `.env` the app is in **demo mode** (localStorage, `/demo` shop,
  `/admin` signs straight in, Telegram buttons simulate linking). Writes are
  harmless; "Reset demo" in the dashboard reseeds.
- With Supabase keys the dev server talks to a **real** project: each write
  needs the user's "yes" in chat for that one action, and Telegram messages
  may really be sent. Prefix test data with `QA`.
- Start `barber-dev` (`.claude/launch.json`) and use the built-in browser;
  `resize_window` mobile preset for client flows (they happen on phones).

## 4. Checklist (apply what the target touches)

**BOOK** — public booking at `/:slug`: pick 1 and 2+ services (duration and
total add up), day chips skip days off and closed dates, time groups
(morning/afternoon/evening), details with saved name/phone, confirm → `/b/:token?new=1`
shows the right date, time, services and total; the sticky phone bar mirrors
the desktop summary; a second booking at the same time fails with
`err_slot_taken` and reloads busy times.

**SLOT** — free times respect working hours, lead time (today only), buffer
(both sides), step, booking window; a cancelled booking frees its slot; a
`blocked` time blocks it; tomorrow's first slot equals opening time.

**CANCEL** — cancel from `/b/:token` before the deadline works and the slot
frees; after the deadline the button is gone and `cancelClosed` shows;
cancelled page offers "Book again" with the same services preselected.

**FEED** — feedback form hidden before the visit starts (`feedbackLater`),
shown after; one review per booking; it appears on the shop page and in
`/admin/feedback`; hide/show toggles affect the public list.

**CAL** — `/admin`: week/day views, today marker, bookings at the right
pixel offsets, open a booking → done / no-show / cancel / restore; new
manual booking and block time; clash warning; waitlist panel for the day.

**SVC** — add/edit/archive a service; duration chips; hidden service not on
the public page; archived service still named in old bookings.

**CLI** — tiles, charts, client table and search; client sheet with history,
private note (saved on blur) and block → blocked phone gets
`err_client_blocked` on the public page; CSV export opens in Excel.

**SET** — every setting round-trips after save and reload (hours, closed
dates, buffer, cancel hours, links, reminder hours, summary hour); QR renders
and downloads; link copies; Telegram connect state.

**TG** — demo: "Open bot" marks the booking linked; real: deep links
`?start=b_<token>` / `?start=s_<code>`, the bot reply, `notifications` rows
(`new_booking`, `confirmed`, `reminder` ×N, `client_cancelled` …) via SQL.

**I18N** — switch O'z/Ru/En on every screen: nothing refetches (network
tab), forms keep values, no English fallback leaks (`t(key)` returns key).

**UI** — shimmers on load (no spinner), `ErrorNote` with retry on a failed
load (offline), light and dark, 375 px with no horizontal scroll, bottom
tabs do not cover content.

## 5. Report
Skeleton from `review-core` section 3. **S0** = double booking, wrong
total, phone visible publicly, booking lost, crash. **S1** = a flow broken or
misleading. **S2** = cosmetic. Append new cases to `references/cases.md`
and a run-log row.
