-- Roles. Apply after 004.
--   Platform admin: rows in platform_admins (only the site owner). Approves and suspends barbers
--                   in /owner. Add yourself once from the SQL editor, e.g. by your login phone:
--                     insert into platform_admins (user_id)
--                     select id from auth.users where email = 'p998901234567@phone.barber.local';
--   Barber:         a user who owns a shop. New shops start 'pending' and stay hidden from clients
--                   until the admin approves them.
--   Client:         any signed-in user. Bookings made while signed in are linked to them and
--                   listed in /me; booking without an account still works.
-- Also: nothing can be booked or blocked in the past, including from the barber's calendar.

-- ── Platform admins ─────────────────────────────────────────────────────────
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security; -- no policies: SQL editor / service role only

create or replace function is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = (select auth.uid()))
$$;

-- ── Shop approval ───────────────────────────────────────────────────────────
-- Shops that existed before roles keep working; new ones wait for approval.
alter table shops add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'suspended'));
alter table shops alter column status set default 'pending';

-- Barbers cannot approve themselves, and a few slugs would hide behind app routes.
-- auth.uid() is null for the SQL editor and the service role, which may set anything.
create or replace function shops_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.slug is distinct from old.slug) and new.slug = any(array['admin', 'owner', 'api', 'assets']) then
    raise exception 'slug_taken';
  end if;
  if (select auth.uid()) is null then return new; end if;
  if tg_op = 'INSERT' then
    new.status := case when is_platform_admin() then 'approved' else 'pending' end;
  elsif new.status is distinct from old.status and not is_platform_admin() then
    raise exception 'not_allowed';
  end if;
  return new;
end $$;
drop trigger if exists shops_guard on shops;
create trigger shops_guard before insert or update on shops for each row execute function shops_guard();

-- Pending and suspended shops are visible only to their barber and the admin.
drop policy if exists shops_public_read on shops;
create policy shops_public_read on shops for select
  using (status = 'approved' or owner_id = (select auth.uid()) or is_platform_admin());

drop policy if exists services_public_read on services;
create policy services_public_read on services for select
  using ((active and not archived and exists (select 1 from shops s where s.id = shop_id and s.status = 'approved'))
         or exists (select 1 from shops s where s.id = shop_id and s.owner_id = (select auth.uid())));

-- Telegram chats of the admins: their Telegram sign-in or their own shop's linked chat.
create or replace function platform_admin_chats() returns setof bigint language sql stable security definer set search_path = public as $$
  select ta.telegram_id from telegram_accounts ta join platform_admins a on a.user_id = ta.user_id
  union
  select s.owner_chat_id from shops s join platform_admins a on a.user_id = s.owner_id where s.owner_chat_id is not null
$$;
revoke all on function platform_admin_chats() from public;

create or replace function shops_status_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare c bigint; page text := app_base_url() || '/' || new.slug;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      for c in select * from platform_admin_chats() loop
        perform enqueue_notification(new.id, null, 'new_barber', c,
          '💈 <b>Новый барбер ждёт одобрения</b>' || E'\n' || tg_escape(new.name) || ' · ' || page || E'\n\nОдобрить: ' || app_base_url() || '/owner');
      end loop;
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'approved' then
      perform enqueue_notification(new.id, null, 'shop_approved', new.owner_chat_id,
        '✅ <b>Ваша страница записи открыта</b>' || E'\n' || page || E'\n\n' || '✅ <b>Yozilish sahifangiz ochildi</b>');
    elsif new.status = 'suspended' then
      perform enqueue_notification(new.id, null, 'shop_suspended', new.owner_chat_id,
        '⛔️ <b>Онлайн-запись приостановлена</b>' || E'\n' || page || E'\n\n' || '⛔️ <b>Onlayn yozilish to''xtatildi</b>');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists shops_status_notify on shops;
create trigger shops_status_notify after insert or update of status on shops for each row execute function shops_status_notify();

-- ── Admin RPCs ──────────────────────────────────────────────────────────────
create or replace function admin_list_shops()
returns table (
  id uuid, slug text, name text, status text, created_at timestamptz, timezone text, currency text,
  owner_name text, owner_phone text, owner_telegram text,
  services int, upcoming int, visits int, revenue numeric, avg_rating numeric, review_count int
) language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_platform_admin() then raise exception 'not_allowed'; end if;
  return query
  select s.id, s.slug, s.name, s.status, s.created_at, s.timezone, s.currency,
    coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(ta.first_name, ''), '')::text,
    coalesce(nullif(u.raw_user_meta_data->>'phone', ''), nullif(s.phone, ''), '')::text,
    coalesce(ta.username, '')::text,
    (select count(*)::int from services v where v.shop_id = s.id and not v.archived),
    (select count(*)::int from bookings b where b.shop_id = s.id and b.status = 'booked' and b.date >= (now() at time zone s.timezone)::date),
    (select count(*)::int from bookings b where b.shop_id = s.id and b.status = 'done'),
    (select coalesce(sum(b.total_price), 0) from bookings b where b.shop_id = s.id and b.status = 'done'),
    (select coalesce(round(avg(r.rating)::numeric, 2), 0) from reviews r where r.shop_id = s.id),
    (select count(*)::int from reviews r where r.shop_id = s.id)
  from shops s
  left join auth.users u on u.id = s.owner_id
  left join telegram_accounts ta on ta.user_id = s.owner_id
  order by s.status = 'pending' desc, s.created_at desc;
end $$;

create or replace function admin_set_shop_status(p_shop uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not_allowed'; end if;
  if p_status not in ('pending', 'approved', 'suspended') then raise exception 'not_allowed'; end if;
  update shops set status = p_status where id = p_shop;
  if not found then raise exception 'shop_not_found'; end if;
end $$;

-- ── Clients: bookings linked to their account ───────────────────────────────
alter table bookings add column if not exists client_user_id uuid references auth.users(id) on delete set null;
create index if not exists bookings_client_user_idx on bookings (client_user_id, date desc) where client_user_id is not null;

-- A client's own bookings across all shops. Like get_booking: no phone, and the token lets
-- /b/:token cancel or review as before.
create or replace function my_bookings()
returns table (
  token text, date date, start_min int, duration_min int, service_ids uuid[], service_names text[], total_price numeric,
  status text, reviewed boolean, shop_name text, shop_slug text, currency text, timezone text
) language sql stable security definer set search_path = public as $$
  select b.token, b.date, b.start_min, b.duration_min, b.service_ids, b.service_names, b.total_price,
    b.status, exists (select 1 from reviews r where r.booking_id = b.id), s.name, s.slug, s.currency, s.timezone
  from bookings b join shops s on s.id = b.shop_id
  where b.client_user_id = (select auth.uid()) and (select auth.uid()) is not null and b.status <> 'blocked'
  order by b.date desc, b.start_min desc
  limit 200
$$;

-- ── Nothing starts in the past ──────────────────────────────────────────────
-- create_booking already checks this with the lead time; this also covers the barber's own
-- calendar entries and blocks. The slot that is running now still counts, for walk-ins.
create or replace function bookings_not_in_past() returns trigger language plpgsql security definer set search_path = public as $$
declare s shops; v_now timestamp; v_slot int;
begin
  select * into s from shops where id = new.shop_id;
  v_now := now() at time zone s.timezone;
  v_slot := ((extract(hour from v_now) * 60 + extract(minute from v_now))::int / s.slot_step) * s.slot_step;
  if new.date < v_now::date or (new.date = v_now::date and new.start_min < v_slot) then raise exception 'time_passed'; end if;
  return new;
end $$;
drop trigger if exists bookings_not_in_past on bookings;
create trigger bookings_not_in_past before insert on bookings for each row execute function bookings_not_in_past();

-- ── Booking: only approved shops, and remember the signed-in client ─────────
create or replace function create_booking(
  p_shop uuid, p_service_ids uuid[], p_date date, p_start_min int,
  p_name text, p_phone text, p_note text default '', p_lang text default 'ru', p_telegram jsonb default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_shop shops;
  v_day jsonb;
  v_duration int;
  v_price numeric;
  v_names text[];
  v_now timestamp;
  v_token text;
  v_key text;
  v_tg bigint;
  v_chat bigint;
begin
  select * into v_shop from shops where id = p_shop and status = 'approved';
  if not found then raise exception 'shop_not_found'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 then raise exception 'phone_required'; end if;
  v_key := client_key(p_phone, p_name);
  if exists (select 1 from client_notes where shop_id = p_shop and client_key = v_key and blocked) then raise exception 'client_blocked'; end if;

  select sum(duration_min), sum(price), array_agg(name order by sort, name)
    into v_duration, v_price, v_names
    from services where shop_id = p_shop and id = any(p_service_ids) and active and not archived;
  if v_duration is null or cardinality(v_names) <> cardinality(p_service_ids) then raise exception 'service_unavailable'; end if;

  v_now := now() at time zone v_shop.timezone;
  if p_date < v_now::date or p_date > v_now::date + v_shop.booking_days then raise exception 'date_out_of_range'; end if;
  if p_date = any(v_shop.closed_dates) then raise exception 'outside_hours'; end if;
  if p_date = v_now::date and p_start_min < extract(hour from v_now) * 60 + extract(minute from v_now) + v_shop.lead_min then
    raise exception 'time_passed';
  end if;

  select d into v_day from jsonb_array_elements(v_shop.hours) d where (d->>'day')::int = extract(dow from p_date);
  if v_day is null or (v_day->>'off')::boolean
     or p_start_min < (v_day->>'open')::int or p_start_min + v_duration > (v_day->>'close')::int then
    raise exception 'outside_hours';
  end if;

  -- Buffer: the exclusion constraint stops exact overlaps; this keeps the gap the barber asked for.
  if v_shop.buffer_min > 0 and exists (
    select 1 from bookings b where b.shop_id = p_shop and b.date = p_date and b.status <> 'cancelled'
      and int4range(b.start_min - v_shop.buffer_min, b.start_min + b.duration_min + v_shop.buffer_min) && int4range(p_start_min, p_start_min + v_duration)
  ) then raise exception 'slot_taken'; end if;

  v_tg := verify_telegram_login(p_telegram);
  v_chat := coalesce(v_tg, (select chat_id from telegram_clients where phone_key = v_key));
  if v_tg is not null then
    insert into telegram_clients (phone_key, chat_id, name) values (v_key, v_tg, trim(p_name))
      on conflict (phone_key) do update set chat_id = excluded.chat_id, name = excluded.name, updated_at = now();
  end if;

  begin
    insert into bookings (shop_id, date, start_min, duration_min, service_ids, service_names, total_price, client_name, client_phone, note, lang, client_chat_id, telegram_user_id, client_user_id)
    values (p_shop, p_date, p_start_min, v_duration, p_service_ids, v_names, v_price, trim(p_name), trim(p_phone), left(coalesce(p_note, ''), 500),
            case when p_lang in ('uz', 'ru', 'en') then p_lang else 'ru' end, v_chat, v_tg, (select auth.uid()))
    returning token into v_token;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;
  update waitlist set status = 'booked' where shop_id = p_shop and date = p_date and status in ('waiting', 'notified') and client_key(client_phone, client_name) = v_key;
  return v_token;
end $$;

create or replace function join_waitlist(p_shop uuid, p_date date, p_name text, p_phone text, p_lang text default 'ru')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from shops where id = p_shop and status = 'approved') then raise exception 'shop_not_found'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 then raise exception 'phone_required'; end if;
  if exists (select 1 from waitlist where shop_id = p_shop and date = p_date and status = 'waiting'
             and client_key(client_phone, client_name) = client_key(p_phone, p_name)) then
    return;
  end if;
  insert into waitlist (shop_id, date, client_name, client_phone, lang, client_chat_id)
  values (p_shop, p_date, trim(p_name), trim(p_phone), coalesce(p_lang, 'ru'),
          (select chat_id from telegram_clients where phone_key = client_key(p_phone, p_name)));
end $$;

revoke all on function admin_list_shops(), admin_set_shop_status(uuid, text), my_bookings() from public;
grant execute on function is_platform_admin() to anon, authenticated;
grant execute on function admin_list_shops(), admin_set_shop_status(uuid, text), my_bookings() to authenticated;
