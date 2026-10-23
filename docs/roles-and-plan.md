# Barber: roles and product plan

Research date: 23 October 2026. Sources are listed at the end; claims marked *unverified*
come from third-party guides or marketing copy, not from the vendor's own docs.

This document answers two questions: what do barber booking apps worldwide do with
owner, barber and client accounts, and what should Barber (barberuz.vercel.app) do.

## 1. The market in one page

### Global players

| App | Who it serves | Business model | Role model |
| --- | --- | --- | --- |
| Booksy (US, UK, PL, ES, FR, BR) | Solo barbers to shops; big consumer marketplace | $29.99/mo + $20 per staffer; "Boost" takes 30% of a new client's first visit | Owner + staffers with per-person toggles (see other calendars, see client data, self-checkout) |
| Fresha (120 countries) | Salons and barbers; marketplace | ~$19.95/mo solo, ~$14.95 per bookable member; 20% one-time fee on marketplace new clients | Owner creates custom permission roles; report access in 4 levels |
| Squire (US, UK, CA) | Barbershops with staff | $100–250/mo per shop | Owner, barber logins, front-desk login, commissions, booth rent |
| theCut (US) | Individual barbers, "100M+ cuts" | Free; Pro $20–25/mo; 2.75% on mobile pay | One barber = one account |
| Vagaro (US, CA, UK, AU) | Salons, spas | $30/mo per calendar + add-ons | Custom access levels per location; booth renters with rent collection |
| Treatwell (UK, EU) | Marketplace-first | Subscription + 35% commission on new clients | Venue account |
| Planity (FR, DE, BE) | 40–50k salons | Fixed subscription, no commission | Salon account |
| GlossGenius, Mangomint, Phorest, Zenoti | Salons with staff, enterprise | Flat or per-location tiers, quote-only at the top | Admin plus granular permission groups (Mangomint has ~18) |

### Uzbekistan and CIS

| App | Reach here | Model | Telegram |
| --- | --- | --- | --- |
| Altegio (ex-YCLIENTS international) | De facto leader in Tashkent: most 2GIS booking buttons (Republic, Barbados, Cult, Big Bro…) point to alteg.io; co-marketed with Uzum, Uzum Bank payments since Oct 2025 | Per-employee licence, minimum 2 employees, prepaid; no marketplace; clients book by phone + SMS code, no account | No first-party bot; notifications through paid partners |
| DIKIDI (RU/CIS) | Some Tashkent salons | Free basic tier; paid LITE/PRO/VIP; catalogue listing needs moderation | Notifications from the business's own Telegram account, capped by Telegram |
| TAVOLO (tavolo.uz) | Most complete local offer: catalogue of salons and masters, 67 "Barber & Men" venues in Tashkent | Free forever, no commission; Premium 120,000 UZS/mo via Click | Owner bot alerts, two client reminders, free |
| Stilzone.uz, NavbatApp.uz, Barberim.uz | Small or unverified | Early stage | Barberim is a Telegram Mini App |
| Custom Telegram bots | The common route for a single shop | 1–25 million UZS one-off from agencies | The bot *is* the product |

Local facts that shape the plan:

- About 70% of Uzbek users name Telegram their main messenger; Instagram Direct is the other
  booking channel. Barbershops advertise "write to Direct" and phone numbers; only premium
  chains link to Altegio.
- The hairdressing and beauty market was 8.1 trillion UZS for January to August 2025, up 11%
  year on year; men's barber prices rose 9.3% in 2025 (stat.uz).
- Altegio prices in UZS are not published and require a sales call; TAVOLO and DIKIDI
  compete on "free, no commission".

### What every serious platform has in common

1. **Tenant = business**, with staff inside it. Chair renters are staff with separate payouts
   and their own clients, not separate tenants (Mangomint, Squire, Vagaro).
2. **Owner is all-powerful, every other role is a set of toggles.** Universal toggles: view
   other calendars, edit others' appointments, see client phone, see all vs own sales, reports.
3. **Client phone numbers are the most guarded field**: Altegio masks digits, Mangomint and
   Phorest hide them with one toggle, both can scope clients to "only those who visited me".
4. **Staff join by invite and own a personal login**; Fresha forbids one person in two
   businesses, the others are silent on it.
5. **Clients on marketplaces have one global account** (Booksy, Fresha, Vagaro). Fresha refuses
   guest booking; Altegio, Yandex Maps and DIKIDI book by phone and SMS code with no account.
6. **No-shows**: reminders first, then card on file or a deposit, plus a silent per-business
   block list. Nobody publishes a cross-business blocklist.
7. **Marketplace listings are human-moderated** (Fresha ~7 business days, DIKIDI by
   application, TAVOLO by a moderator's phone call). Platform-admin tools are never public.
8. **Common complaints**: forced client app installs (Booksy), fees charged on returning
   clients (Fresha, Treatwell), per-SMS and per-seat fees, add-on sticker shock (Vagaro),
   un-silenceable notifications (theCut), hard setup (YCLIENTS).

## 2. Where Barber stands today

| Area | Today | Gap against the field |
| --- | --- | --- |
| Tenant | One shop = one barber (`shops.owner_id`) | No staff: a shop with 3 barbers needs 3 shops |
| Platform admin | `platform_admins`, `/owner`: list, approve, suspend, stats | No audit trail, no notes on a shop, no moderation checklist, no "view as barber" |
| Barber onboarding | Self-serve, starts `pending`, admin gets a Telegram alert | Nothing tells the admin what to check; no onboarding progress for the barber |
| Client account | Phone or Telegram sign-in, `/me` lists bookings by `client_user_id`; guest booking works | No favourites, no one-tap rebook, no profile (name prefilled), no "my barbers" |
| No-shows | Reminders via Telegram, per-shop block list, cancellation hours | No deposits (Payme/Click/Uzum), no no-show count per client |
| Discovery | None; each shop is a link | TAVOLO and Altegio-on-2GIS own discovery; a catalogue is a later bet |
| Pricing | Free | Decide now: free forever like TAVOLO, or Altegio-style per-barber licence |

Everything in the right column exists in at least one competitor; none of it changes the
invariants in `AGENTS.md`.

## 3. The decision: three account types, one shop tenant

Keep exactly three kinds of people. Add one new layer inside the shop: **masters** (staff
barbers). This matches how every platform above is built and keeps the current solo-barber
flow untouched: a shop with one master is today's app.

### Owner (platform admin)

The site owner only. Rows in `platform_admins`, panel at `/owner`.

- Approves, suspends and reactivates shops; sees every shop's stats (exists).
- **Moderation checklist** before approving: real name, phone reachable, address, at least one
  service, working hours set, Telegram linked. Shown as ticks on the pending card; the barber
  sees the same list as onboarding progress on `/admin`.
- **Notes and audit**: free-text note per shop and a log of status changes with who and when
  (`shop_events`). Fresha and Booksy review documents; here a phone call and the checklist
  are enough for now.
- **Read-only view of a shop**: open any shop's calendar and services as the barber sees them,
  without impersonating (no "log in as"; no competitor exposes one and it breaks the RLS
  story).
- **Platform settings**: `app_settings` already holds the site address; add reminder defaults,
  the feature flags below, and the pricing switch if a paid tier ever comes.
- Never reads client phones across shops; `admin_list_shops` keeps returning aggregates only.

### Barber (shop owner) and masters

A barber signs up, creates a shop, waits for approval. The shop is the tenant.

- **Owner of the shop**: everything in `/admin` today, plus a **Team** tab: invite a master by
  a Telegram deep link or phone, set the master's services and hours, archive a master.
- **Master**: a second account type inside the shop (`shop_members` with `role = 'master'`).
  Sees own calendar, own clients, can book, move and complete own bookings, and gets own
  Telegram notifications. Three toggles, mirroring Altegio and Mangomint:
  `see_other_calendars`, `see_client_phones`, `see_revenue`. Default: all off.
- **One person, several shops** is allowed (a master can rent a chair in two shops); the
  dashboard shows a shop switcher only when there is more than one membership.
- **Booking page** gains a "choose a master" step when the shop has more than one; "any
  master" picks the first free one. Availability stays decided in SQL: `get_busy`,
  `create_booking` and the exclusion constraint get a `master_id`.
- **No-show protection**, in order: reminders (exist) → per-client no-show counter shown to
  the barber → optional deposit through Payme/Click/Uzum for new clients only (Fresha's
  "first-time clients only" option is the least annoying variant).
- Chair rent, payroll, commissions and inventory are **out of scope** for the next year;
  Squire and Mangomint charge $100+ for them and no local competitor ships them.

### Client

Anyone who books. Booking as a guest stays, as it does on Altegio, DIKIDI and TAVOLO; Booksy's
and Fresha's forced accounts are their most-hated feature.

- **One global account** (phone or Telegram) across all shops, as today. A shop never sees
  the client's bookings at other shops.
- `/me`: upcoming and past bookings (exists), **rebook in one tap** (same services, same
  master, next free slot), **favourite barbers**, profile with name and phone prefilled into
  the booking form.
- Reviews stay tied to a completed booking through its token (exists).
- Cancellation and rescheduling only inside the shop's window (exists); a reschedule button
  replaces cancel-and-rebook.
- Block lists stay per shop and silent (exists).

### What we will not copy

- A marketplace commission (Booksy Boost, Fresha, Treatwell): it is the top complaint
  everywhere and TAVOLO already promises "no commission" locally. Price per shop or per
  master if ever, like Altegio and Planity.
- Per-SMS billing: Telegram reminders are free; SMS is a fallback for clients without
  Telegram, with a cap.
- A mandatory client app: the web page plus the Telegram bot cover it; a Telegram Mini App
  is a later packaging of the same pages.

## 4. Build order

Each phase is shippable on its own and keeps `npm test`, `npm run sql:check` and the
invariants green. Migration numbers continue from `005_roles.sql`.

| Phase | What ships | Where |
| --- | --- | --- |
| **A. Owner panel, complete** | Moderation checklist on pending cards; onboarding progress on `/admin`; `shop_events` audit log with notes; read-only shop view; filters already exist | `006_owner_tools.sql`, `OwnerApp.jsx`, `AdminApp.jsx` |
| **B. Client account, complete** | Profile (name, phone) prefilled on booking; favourites; one-tap rebook; reschedule instead of cancel+rebook; no-show counter visible to the barber | `007_client_profile.sql`, `MyBookings.jsx`, `ShopPage.jsx`, `Clients.jsx` |
| **C. Masters** | `shop_members` with role and three toggles; Team tab; invite by Telegram link; `master_id` on bookings, busy intervals and the exclusion constraint; "choose a master" on the booking page; per-master notifications | `008_masters.sql`, new `Team.jsx`, `slots.js`, `CalendarView.jsx`, `ShopPage.jsx`, webhook `/start m_<code>` |
| **D. Deposits** | Payme/Click/Uzum prepayment for new clients, refunded inside the cancellation window; `bookings.deposit_status` | `009_deposits.sql`, `api/pay/*` |
| **E. Discovery** | Public `/barbers` catalogue of approved shops with ratings, city filter; 2GIS and Yandex Maps booking links | later, after 20+ approved shops |

Phases A and B touch no shared files and can run in parallel; C depends on neither but
changes the booking contract, so it goes alone.

### Decisions still open

1. **Pricing**: free forever (TAVOLO) or a per-master licence after N months (Altegio)?
   The plan assumes free while the catalogue is small.
2. **Approval strictness**: approve after the checklist only, or always call first?
3. **Masters as separate logins vs names only**: the plan takes separate logins (every
   competitor does); a names-only version of phase C is half the work but blocks per-master
   notifications and permissions.

## 5. Sources

Global: koalendar.com/blog/booksy-pricing; fresha.com/pricing; capterra.com (Squire, Vagaro,
Booksy, Treatwell reviews); help.thecut.co; glossgenius.com/pricing;
mangomint.com/blog/pricing-update-2026; treatwell.co.uk/partners; phorest.com/pricing;
styleseat.com/blog/how-much-does-styleseat-cost; biz.booksy.com/whats-new;
fresha.com/help-center (team permissions, add team members, block clients, online profile);
alteg.io/en/support/knowledge-base (user roles, client database access rights);
mangomint.com/learn/staff-member-permissions; help.zenoti.com (default security roles);
phorest.helpjuice.com (access levels, restrict contact details).

Uzbekistan and CIS: ca-barometer.org (messenger survey); stat.uz (beauty services 2025);
2gis.uz/tashkent/search/Барбершопы; alteg.io/info/about; altegio.uzum.com;
spot.uz/ru/2025/10/03/uzum-altegio; support.dikidi.net (tariffs, Telegram notifications);
tavolo.uz/en/pricing, /for-salons, /for-masters; stilzone.uz; navbatapp.uz;
slotlycrm.ru; nami.expert; gptbot.uz, botforge.uz (bot prices).
