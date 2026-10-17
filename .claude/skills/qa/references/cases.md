# QA regression catalog (Barber)

Severity if failed: **S0** double booking, wrong total, phone visible publicly, booking lost, crash (the `smoke` set); **S1** a broken flow or misleading UI; **S2** cosmetic. IDs are stable; append at the end of an area, never renumber. `[qa YYYY-MM-DD]` marks a case added from a finding.

Demo mode (no `.env`) is safe to write to. With Supabase keys every write is real and needs the user's "yes" in chat for that one action; prefix data with `QA`.

## Run log (newest first; `retest` starts from the top row)

| Date | Commit | Scope | Findings (S0/S1/S2) | Checks run | Not run |
|---|---|---|---|---|---|

## BOOK — public booking

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| BOOK-001 | S0 | Book one service | `/demo` → Haircut → day → time → name/phone → confirm | `/b/<token>?new=1` with the same date, time, service, total |
| BOOK-002 | S0 | Two services add up | Haircut + Beard trim | Duration 70 min, total = sum; slots fit the longer visit |
| BOOK-003 | S0 | Same time twice fails cleanly | Book 13:00 twice (second tab) | `err_slot_taken`, busy reloads, time cleared |
| BOOK-004 | S1 | Sticky bar mirrors summary | 375 px | Price, duration, chosen time; button label changes per step |
| BOOK-005 | S1 | Rebook link preselects | From a done/cancelled `/b/<token>` click "Book again" | Same services ticked on `/demo` |
| BOOK-006 | S1 | Links in hero | Instagram, Telegram, map | Open in new tab to the right handles |

## SLOT — free times

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| SLOT-001 | S0 | Cancelled booking frees its slot | Cancel from `/b/<token>`, reload `/demo` | Time offered again |
| SLOT-002 | S1 | Buffer respected | Settings buffer 15 → book 12:00–12:45 | 12:45 and 11:45 not offered for a 30 min visit |
| SLOT-003 | S1 | Closed date | Add tomorrow to closed dates | Chip disabled, "Day off" shown |
| SLOT-004 | S1 | Lead time today | Lead 60 min | First slot today ≥ now + 60 |

## CANCEL / FEED

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| CANCEL-001 | S0 | Cancel before deadline | `/b/<token>` → Cancel → Yes | Status Cancelled; `cancelled` list in day calendar |
| CANCEL-002 | S1 | After deadline | cancel_hours 48, booking tomorrow | No cancel button; `cancelClosed` text |
| FEED-001 | S0 | One review per booking | Mark done in admin → rate on `/b/<token>` twice | Second attempt shows thanks (already reviewed) |
| FEED-002 | S1 | Hidden review off the public page | Hide in `/admin/feedback` | Gone from `/demo`, count updated |

## CAL / SVC / CLI / SET

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| CAL-001 | S0 | Mark done / no-show / restore | Open a booking | Status pill and block colour update; stats change |
| CAL-002 | S1 | Manual booking clash warning | New booking over an existing one | Warning shown; save fails with `err_slot_taken` |
| CAL-003 | S1 | Block time | Block 13:00–14:00 | Hatched block; public page hides 13:00–14:00 |
| CAL-004 | S1 | Waitlist panel | Join waitlist on a full day on `/demo`, open that day in admin | Row with name, phone, status |
| SVC-001 | S1 | Hidden service | Uncheck "Shown to clients" | Missing on `/demo`, present in admin with Hidden tag |
| SVC-002 | S1 | Category grouping | Set categories Hair/Beard | Public page shows group headings |
| CLI-001 | S1 | Block a client | Client sheet → Block | `/demo` booking with that phone → `err_client_blocked` |
| CLI-002 | S1 | Note saved on blur | Type note, click away, reopen | Note persists; shows under the name in the table |
| CLI-003 | S2 | CSV export | Click Export | File with header row and all clients |
| SET-001 | S1 | Settings round-trip | Change every field, Save, reload | All values persist |
| SET-002 | S1 | QR and link | Settings top card | QR image, copy works, download yields PNG |
| SET-003 | S1 | Telegram connect (demo) | Click Connect | "Connected" state |

## TG / I18N / UI

| ID | Sev | Case | Check | Expect |
|---|---|---|---|---|
| TG-001 | S1 | Client linking (demo) | `/b/<token>` → Open bot | "Telegram reminders are on" |
| TG-002 | S1 | Queue rows (SQL) | `npm run sql:check` | new_booking, reminders, cancellation, slot_freed as asserted |
| I18N-001 | S1 | Switching language keeps state | Fill the form, switch Ru→O'z→En | Values kept, no network request, no raw keys |
| UI-001 | S1 | Shimmers and errors | Throttle offline, reload `/demo` | Shimmers then `ErrorNote` with retry; no spinner |
| UI-002 | S1 | Phone layout | 375 px, all pages | No horizontal scroll; bottom bars never cover inputs |
| UI-003 | S2 | Dark theme | Toggle | Every card readable; copper buttons visible |
