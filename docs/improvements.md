# Barber: improvement findings

Investigation date: 23 October 2026. Sources: a walk of the live app in a phone-sized browser,
a read of the client-side and barber-side code and SQL, the production database through the
public key, and the competitor scan in `roles-and-plan.md`. Every file reference was checked
against the current tree. Effort: S under half a day, M one to three days, L a week or more.

## 0. Production is behind the code

| Fact | Consequence |
| --- | --- |
| The live database has migrations 001–004 only; `shops.status` does not exist | The roles commit and the owner tools commit (both on `main`, unpushed) will break `/admin`, `/owner`, `/me` and the booking page the moment they deploy |
| Two commits are not pushed | Vercel still serves the pre-roles app |
| The one live shop, Bradobrey, has zero services | Its booking page is a dead end (see 2.1) |

Order of operations: run migrations 005 and 006 in the Supabase SQL editor, add yourself to
`platform_admins`, approve Bradobrey (existing shops default to `approved` in 005, so this is a
check, not a step), then push.

## 1. Security and correctness, ranked

**1.1 Anyone can hijack a shop's Telegram notifications. S0.** `shops_public_read` is a
row policy on the whole table and `getShopBySlug` selects `*`, so the public key returns
`telegram_link_code`, `owner_chat_id` and `owner_id` for every shop. Verified against
production: the anon key reads Bradobrey's link code. The webhook's `/start s_<code>` branch
(`api/telegram/webhook.js:85`) then links any chat that sends that code, with no owner check.
An attacker receives every new booking with the client's name and phone. Fix: a
`shops_public` view with presentation columns only, point `getShopBySlug` at it, revoke
select on `shops` from anon and authenticated, rotate every `telegram_link_code` in the same
migration. **Done in `migrations/007_shops_public.sql`; apply it to production together with 005 and 006.**

**1.2 The pg_net dispatcher marks every message sent without reading the reply.**
`migrations/002:435-441` calls `finish_notification(id, true)` right after `net.http_post`.
Blocked bots and wrong chat ids look like successes; reminders silently vanish. Fix: a
follow-up cron step that joins `net._http_response` and re-queues non-200 rows. **M**

**1.3 Reminders depend on pg_cron being set up, and nothing checks it.** The Vercel fallback
in `vercel.json` runs once a day at 04:00, so without pg_cron a 2-hour reminder arrives next
morning. Verify `select * from cron.job` in production; add the check to the deploy notes.
Also `claim_notifications` never returns rows stuck in `sending` after a crash. **S**

**1.4 Stale "now" re-offers past slots.** `ShopPage.jsx:90` computes the shop's current time
once per mount. A tab left open on a phone shows times that already passed, and after
`time_passed` only the busy list reloads, so the same dead slots come back. Fix: refresh
`now` and busy intervals on `visibilitychange`, focus and every minute. **S**

**1.5 The waitlist promises a Telegram message it cannot send.** The sheet says "we will
message you in Telegram", but `join_waitlist` only finds a chat for clients already in
`telegram_clients`, and `slot_freed` skips rows with no chat. Fix: return the waitlist id
and show the bot deep link (`/start w_<id>`) right after joining. **M**

**1.6 Walk-ins added by the barber get no reminders.** The barber's insert leaves
`client_chat_id` null even when the phone is in `telegram_clients`. Regulars booked by phone
never hear from the bot. Fix: a `barber_add_booking` RPC that looks up the chat by
`client_key()`. **S/M**

**1.7 Restoring a cancelled booking never re-arms reminders.** The client got "barber
cancelled your visit" and then nothing. Fix in the status trigger. **S**

**1.8 Session refresh wipes the dashboard.** `AdminApp.jsx:21-30` resets the shop on every
auth event, including hourly token refreshes, unmounting the calendar and any open walk-in
form. Fix: key the effect on the user id. **S**

**1.9 A client who only no-shows cannot be found or blocked.** `stats.js` builds the client
list from `done` bookings. Fix: build from all bookings; count done, no-show and cancelled
per client. **S** (also the no-show counter from phase B)

**1.10 Calendar flooding is free.** `create_booking` accepts unlimited bookings per phone.
Fix: reject when the client key already holds two or three upcoming bookings in that shop.
**S**

**1.11 Smaller:** one owner with two shops breaks `/admin` (add a unique index on
`shops.owner_id` until masters arrive); open ≥ close is accepted in settings; waitlist
removal swallows errors; `Sheet` has no focus trap or label; raw "Failed to fetch" shows in
every language; the cancel deadline on `/b/:token` is formatted in the browser's timezone;
the Clients tab loads the whole history every visit. All **S** except the Clients query (**M**,
needs an aggregate RPC).

## 2. What a client hits on the booking page

**2.1 A shop with no services is a dead end.** Step 1 shows only "You can pick more than
one" and nothing else. Fix: an empty state with the shop's phone and Telegram so the client
can still reach the barber, and the approval checklist already blocks this for new shops.
**S**

**2.2 Empty stats on a new shop.** "0 clients served, 0.0, 0 reviews" is the first thing a
client sees. Hide the tiles until there is data. **S**

**2.3 The link preview is generic.** Nothing sets `document.title` or OpenGraph tags, so a
shop link pasted into Telegram or Instagram shows "Barber — online booking" for every shop.
In a market where booking happens in chats this is the storefront. Fix: `document.title`
and `lang` in `ShopPage`, plus an `api/og/[slug]` route or bot-agent rewrite that serves
per-shop meta. **M**

**2.4 Guests lose their booking.** The only record is the `/b/:token` URL. Fix: keep recent
tokens in localStorage and show "your upcoming visit" at the top of the shop page with
cancel and rebook. **S**

**2.5 No reschedule.** Cancel-then-rebook loses the slot and sends a scary message. Fix:
`reschedule_booking(token, date, start)` reusing the create checks, re-arming reminders, and
a "Move" button beside "Cancel" on both `/b/:token` and the barber's calendar. Prerequisite:
extend `bookings_not_in_past` to updates and add a `moved` notification kind. **M**

**2.6 Friction in the form.** Signing in mid-form drops the chosen services and time; the
confirm button is disabled with no reason; fully booked days look like closed days;
the confirmation page lacks address, phone and map; no "add to calendar"; reviews show full
client names. All **S**.

**2.7 The review request depends on the barber clicking Done.** A solo barber who never
marks visits done gets no reviews. Fix: enqueue the review request at start plus duration
plus one hour; dedupe with the done branch. **S**

**2.8 The bundle is one 574 kB file (165 kB gzipped).** A client opening a booking link on
mobile data downloads the whole barber dashboard and the QR library. Fix: lazy-load
`/admin`, `/owner` and `/me` routes with `React.lazy`. **S**

**2.9 Page transitions blur the whole page for about a second** on route change, visible
on every booking link open. Shorten to 200 ms or skip it for the first paint. **S**

## 3. What a barber hits in the dashboard

- **No reschedule, no edit** (2.5 above, plus editing phone, note and services on a
  barber-sourced booking). **M**
- **Regulars retyped every walk-in.** No typeahead over past clients. **S/M**
- **Today's revenue is nowhere**; the Clients tab offers 30, 90 days or all. A strip above
  the calendar with today's count, done and expected sum. **S**
- **Closing today takes five taps** through settings; no warning about existing bookings.
  "Close this day" in the day header. **S**
- **No recurring breaks**; lunch is blocked by hand daily. `shops.breaks` honoured in
  `slots.js` and `create_booking`. **M**
- **Services cannot be reordered** although `sort` exists; the category autocomplete has no
  `datalist`. **S**
- **Telegram cannot be re-linked** once connected. **S**
- **The daily summary is Russian-only** and has no phones, gaps or totals. **S**
- **Reminders have no buttons.** "Confirm / Cancel" on the client's reminder and
  "Done / No-show" on the barber's new-booking message, through callback data in the
  webhook. This is the single most visible upgrade against TAVOLO and Altegio. **M**

## 4. Location

Three different things, in order of value for this app:

**4.1 A pinned map on the shop page. S.** `shops.maps_url` already exists and the Telegram
confirmation includes the address, but the web confirmation page shows neither. Add
address, "Call" and "Route" buttons to `/b/:token` and a map link under the shop header. Let
the barber paste a Yandex Maps or 2GIS link, which is what Tashkent clients use.

**4.2 Choosing a city or district when finding a barber. M, with phase E.** Today there is
no catalogue; every shop is a link. When the public `/barbers` page arrives it needs
`shops.city` and `shops.district` (Tashkent districts as a fixed list, other cities free
text), a filter at the top, and "near me" from the browser's position using a stored
latitude and longitude. The platform admin's checklist should then require a city.

**4.3 A shop with several branches. L, after masters.** Altegio and Fresha model this as one
company with several locations, each with its own address, hours and staff. For Barber this
means a `locations` table under `shops`, a location picker as step zero on the booking page,
and `location_id` on bookings, services and masters. Not worth building before any shop
asks for it; the masters phase should leave room for it by scoping hours and bookings to a
location id that defaults to the shop.

## 5. Suggested order

1. Apply migrations 005 and 006 to production, push (section 0).
2. Close the Telegram hijack (1.1) and the dispatcher blind spot (1.2, 1.3).
3. The small client fixes that cost under a day together: stale now (1.4), empty service
   state and stats (2.1, 2.2), lazy routes (2.8), guest booking memory (2.4), map and
   contact on the confirmation page (4.1).
4. Reschedule end to end (2.5) with its SQL prerequisites, then reminder buttons (section 3).
5. Phase B of the roles plan (client profile, favourites, rebook, no-show counter) on top.
