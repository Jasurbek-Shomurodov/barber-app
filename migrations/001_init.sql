-- Navbat: online booking for barbers. One Supabase project serves many shops; each shop
-- belongs to one owner (auth user) and is reached publicly by its slug.
--
-- Times are stored as (date, start_min, duration_min) in the shop's own timezone, so a
-- booking never shifts when a browser or server runs in another zone.
--
-- Clients never read the bookings table directly. They see busy intervals and their own
-- booking (by its secret token) through the SECURITY DEFINER functions below.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create table if not exists shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  tagline text not null default '',
  address text not null default '',
  phone text not null default '',
  timezone text not null default 'Asia/Tashkent',
  currency text not null default 'UZS',
  slot_step int not null default 15 check (slot_step in (5, 10, 15, 20, 30, 60)),
  lead_min int not null default 30 check (lead_min between 0 and 1440),
  booking_days int not null default 21 check (booking_days between 1 and 90),
  -- [{ "day": 0..6, "open": minutes, "close": minutes, "off": bool }]
  hours jsonb not null default '[
    {"day":0,"open":600,"close":1200,"off":true},
    {"day":1,"open":600,"close":1200,"off":false},
    {"day":2,"open":600,"close":1200,"off":false},
    {"day":3,"open":600,"close":1200,"off":false},
    {"day":4,"open":600,"close":1200,"off":false},
    {"day":5,"open":600,"close":1200,"off":false},
    {"day":6,"open":600,"close":1200,"off":false}]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  description text not null default '',
  duration_min int not null check (duration_min between 5 and 480),
  price numeric(12, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  -- Archived services stay for history but disappear from every list.
  archived boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists services_shop_idx on services (shop_id, sort);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  date date not null,
  start_min int not null check (start_min between 0 and 1439),
  duration_min int not null check (duration_min between 5 and 720),
  service_ids uuid[] not null default '{}',
  -- Snapshot at booking time: renaming or repricing a service never rewrites history.
  service_names text[] not null default '{}',
  total_price numeric(12, 2) not null default 0,
  client_name text not null default '',
  client_phone text not null default '',
  note text not null default '',
  status text not null default 'booked' check (status in ('booked', 'done', 'no_show', 'cancelled', 'blocked')),
  source text not null default 'online' check (source in ('online', 'barber')),
  created_at timestamptz not null default now(),
  -- One chair: two live bookings of a shop can never overlap on the same day.
  constraint bookings_no_overlap exclude using gist (
    shop_id with =,
    date with =,
    int4range(start_min, start_min + duration_min) with &&
  ) where (status <> 'cancelled')
);
create index if not exists bookings_shop_date_idx on bookings (shop_id, date);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  booking_id uuid unique references bookings(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  client_name text not null default '',
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reviews_shop_idx on reviews (shop_id, created_at desc);

-- ── Row level security ───────────────────────────────────────────────────────
alter table shops enable row level security;
alter table services enable row level security;
alter table bookings enable row level security;
alter table reviews enable row level security;

drop policy if exists shops_public_read on shops;
create policy shops_public_read on shops for select using (true);
drop policy if exists shops_owner_write on shops;
create policy shops_owner_write on shops for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists services_public_read on services;
create policy services_public_read on services for select
  using ((active and not archived) or exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid()));
drop policy if exists services_owner_write on services;
create policy services_owner_write on services for all
  using (exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid()));

drop policy if exists bookings_owner_all on bookings;
create policy bookings_owner_all on bookings for all
  using (exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid()));

drop policy if exists reviews_public_read on reviews;
create policy reviews_public_read on reviews for select
  using (not hidden or exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid()));
drop policy if exists reviews_owner_update on reviews;
create policy reviews_owner_update on reviews for update
  using (exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid()));

-- ── Owner: create a shop ─────────────────────────────────────────────────────
create or replace function create_my_shop(p_slug text, p_name text)
returns shops language plpgsql security definer set search_path = public as $$
declare v shops;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into shops (owner_id, slug, name) values (auth.uid(), lower(trim(p_slug)), trim(p_name)) returning * into v;
  return v;
end $$;

-- ── Public: busy intervals (no names or phones) ─────────────────────────────
create or replace function get_busy(p_shop uuid, p_from date, p_to date)
returns table (date date, start_min int, duration_min int)
language sql stable security definer set search_path = public as $$
  select b.date, b.start_min, b.duration_min from bookings b
  where b.shop_id = p_shop and b.date between p_from and p_to and b.status <> 'cancelled'
$$;

-- ── Public: book a visit ─────────────────────────────────────────────────────
-- Duration and price come from the services table, never from the client. The
-- exclusion constraint rejects a time someone else took a moment earlier.
create or replace function create_booking(
  p_shop uuid, p_service_ids uuid[], p_date date, p_start_min int,
  p_name text, p_phone text, p_note text default ''
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_shop shops;
  v_day jsonb;
  v_duration int;
  v_price numeric;
  v_names text[];
  v_now timestamp;
  v_token text;
begin
  select * into v_shop from shops where id = p_shop;
  if not found then raise exception 'shop_not_found'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 then raise exception 'phone_required'; end if;

  select sum(duration_min), sum(price), array_agg(name order by sort, name)
    into v_duration, v_price, v_names
    from services where shop_id = p_shop and id = any(p_service_ids) and active and not archived;
  if v_duration is null or cardinality(v_names) <> cardinality(p_service_ids) then raise exception 'service_unavailable'; end if;

  v_now := now() at time zone v_shop.timezone;
  if p_date < v_now::date or p_date > v_now::date + v_shop.booking_days then raise exception 'date_out_of_range'; end if;
  if p_date = v_now::date and p_start_min < extract(hour from v_now) * 60 + extract(minute from v_now) + v_shop.lead_min then
    raise exception 'time_passed';
  end if;

  select d into v_day from jsonb_array_elements(v_shop.hours) d where (d->>'day')::int = extract(dow from p_date);
  if v_day is null or (v_day->>'off')::boolean
     or p_start_min < (v_day->>'open')::int or p_start_min + v_duration > (v_day->>'close')::int then
    raise exception 'outside_hours';
  end if;

  begin
    insert into bookings (shop_id, date, start_min, duration_min, service_ids, service_names, total_price, client_name, client_phone, note)
    values (p_shop, p_date, p_start_min, v_duration, p_service_ids, v_names, v_price, trim(p_name), trim(p_phone), left(coalesce(p_note, ''), 500))
    returning token into v_token;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;
  return v_token;
end $$;

-- ── Public: a client's own booking, by secret token ─────────────────────────
create or replace function get_booking(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id, 'token', b.token, 'shop_id', b.shop_id, 'date', b.date, 'start_min', b.start_min,
    'duration_min', b.duration_min, 'service_names', b.service_names, 'total_price', b.total_price,
    'client_name', b.client_name, 'status', b.status,
    'reviewed', exists (select 1 from reviews r where r.booking_id = b.id),
    'shop_slug', s.slug, 'timezone', s.timezone)
  from bookings b join shops s on s.id = b.shop_id where b.token = p_token
$$;

create or replace function cancel_booking(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled' where token = p_token and status = 'booked';
  if not found then raise exception 'cannot_cancel'; end if;
end $$;

-- Feedback is allowed once per visit, after it has started (or the barber marked it done).
create or replace function submit_review(p_token text, p_rating int, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings; v_now timestamp; v_tz text;
begin
  select * into b from bookings where token = p_token;
  if not found then raise exception 'booking_not_found'; end if;
  select timezone into v_tz from shops where id = b.shop_id;
  v_now := now() at time zone v_tz;
  if b.status in ('cancelled', 'no_show', 'blocked') then raise exception 'cannot_review'; end if;
  if b.status <> 'done' and (b.date + make_interval(mins => b.start_min)) > v_now then raise exception 'too_early'; end if;
  insert into reviews (shop_id, booking_id, rating, comment, client_name)
  values (b.shop_id, b.id, p_rating, left(coalesce(p_comment, ''), 1000), b.client_name);
exception when unique_violation then
  raise exception 'already_reviewed';
end $$;

-- ── Public: headline numbers for the shop page ──────────────────────────────
create or replace function get_public_stats(p_shop uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'clients', (select count(distinct coalesce(nullif(right(regexp_replace(client_phone, '\D', '', 'g'), 9), ''), lower(client_name)))
                from bookings where shop_id = p_shop and status = 'done'),
    'visits', (select count(*) from bookings where shop_id = p_shop and status = 'done'),
    'avg_rating', (select coalesce(round(avg(rating)::numeric, 2), 0) from reviews where shop_id = p_shop and not hidden),
    'review_count', (select count(*) from reviews where shop_id = p_shop and not hidden))
$$;

grant execute on function get_busy(uuid, date, date), create_booking(uuid, uuid[], date, int, text, text, text),
  get_booking(text), cancel_booking(text), submit_review(text, int, text), get_public_stats(uuid) to anon, authenticated;
grant execute on function create_my_shop(text, text) to authenticated;
