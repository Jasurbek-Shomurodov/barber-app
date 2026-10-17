-- Barber: Telegram (login, linking, notifications, reminders), booking policies, client notes,
-- waitlist and shop profile fields. Apply after 001.
--
-- Telegram sending happens inside Postgres: triggers enqueue rows in `notifications`, and
-- `dispatch_notifications()` posts them with pg_net every minute (pg_cron). The bot token lives
-- in Supabase Vault under the name `telegram_bot_token`:
--   select vault.create_secret('<token>', 'telegram_bot_token');
-- Where pg_net / pg_cron / vault are missing (local test databases) the queue still fills and
-- `api/telegram/dispatch.js` can flush it instead.

-- ── Shop profile and booking policies ───────────────────────────────────────
alter table shops
  add column if not exists buffer_min int not null default 0 check (buffer_min between 0 and 120),
  add column if not exists cancel_hours int not null default 2 check (cancel_hours between 0 and 168),
  add column if not exists closed_dates date[] not null default '{}',
  add column if not exists instagram text not null default '',
  add column if not exists telegram text not null default '',
  add column if not exists maps_url text not null default '',
  add column if not exists owner_chat_id bigint,
  add column if not exists telegram_link_code text not null unique default encode(gen_random_bytes(8), 'hex'),
  add column if not exists notify_new_booking boolean not null default true,
  add column if not exists daily_summary_hour int check (daily_summary_hour between 0 and 23),
  add column if not exists reminder_hours int[] not null default '{24,2}';
update shops set daily_summary_hour = 8 where daily_summary_hour is null;

alter table services add column if not exists category text not null default '';

alter table bookings
  add column if not exists lang text not null default 'ru' check (lang in ('uz', 'ru', 'en')),
  add column if not exists client_chat_id bigint,
  add column if not exists telegram_user_id bigint;

-- Phone or, failing that, name identifies a client across bookings.
create or replace function client_key(p_phone text, p_name text)
returns text language sql immutable as $$
  select coalesce(nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9), ''), 'name:' || lower(trim(coalesce(p_name, ''))))
$$;

-- ── Client notes and blocks (per shop) ──────────────────────────────────────
create table if not exists client_notes (
  shop_id uuid not null references shops(id) on delete cascade,
  client_key text not null,
  note text not null default '',
  blocked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (shop_id, client_key)
);
alter table client_notes enable row level security;
drop policy if exists client_notes_owner on client_notes;
create policy client_notes_owner on client_notes for all
  using (exists (select 1 from shops s where s.id = shop_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from shops s where s.id = shop_id and s.owner_id = (select auth.uid())));

-- ── Telegram identities ─────────────────────────────────────────────────────
-- Barbers who signed in with Telegram (api/auth/telegram.js) and the chat we can message.
create table if not exists telegram_accounts (
  telegram_id bigint primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null default '',
  first_name text not null default '',
  created_at timestamptz not null default now()
);
alter table telegram_accounts enable row level security;
drop policy if exists telegram_accounts_self on telegram_accounts;
create policy telegram_accounts_self on telegram_accounts for select using (user_id = (select auth.uid()));

-- Clients who opened the bot: phone → chat, so a returning client gets reminders automatically.
create table if not exists telegram_clients (
  phone_key text primary key,
  chat_id bigint not null,
  name text not null default '',
  updated_at timestamptz not null default now()
);
alter table telegram_clients enable row level security; -- service role only

-- ── Waitlist ────────────────────────────────────────────────────────────────
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  date date not null,
  client_name text not null,
  client_phone text not null,
  client_chat_id bigint,
  lang text not null default 'ru',
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'booked', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists waitlist_shop_date_idx on waitlist (shop_id, date, status);
alter table waitlist enable row level security;
drop policy if exists waitlist_owner on waitlist;
create policy waitlist_owner on waitlist for all
  using (exists (select 1 from shops s where s.id = shop_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from shops s where s.id = shop_id and s.owner_id = (select auth.uid())));

create or replace function join_waitlist(p_shop uuid, p_date date, p_name text, p_phone text, p_lang text default 'ru')
returns void language plpgsql security definer set search_path = public as $$
begin
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
grant execute on function join_waitlist(uuid, date, text, text, text) to anon, authenticated;

-- ── Notification queue ──────────────────────────────────────────────────────
create table if not exists notifications (
  id bigserial primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  kind text not null,
  chat_id bigint not null,
  text text not null,
  send_after timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts int not null default 0,
  request_id bigint,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notifications_due_idx on notifications (send_after) where status = 'pending';
create index if not exists notifications_booking_idx on notifications (booking_id);
create index if not exists notifications_shop_idx on notifications (shop_id, created_at desc);
alter table notifications enable row level security;
drop policy if exists notifications_owner_read on notifications;
create policy notifications_owner_read on notifications for select
  using (exists (select 1 from shops s where s.id = shop_id and s.owner_id = (select auth.uid())));

-- Message templates. Minutes/labels are rendered here so every sender (trigger, cron, API) agrees.
create or replace function tg_time_label(p_min int) returns text language sql immutable as $$
  select lpad((p_min / 60)::text, 2, '0') || ':' || lpad((p_min % 60)::text, 2, '0')
$$;

create or replace function tg_escape(p text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

create or replace function tg_date_label(p_date date, p_lang text) returns text language sql immutable as $$
  select case p_lang
    when 'en' then to_char(p_date, 'Dy, DD Mon YYYY')
    when 'uz' then to_char(p_date, 'DD.MM.YYYY') || ' (' || (array['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'])[extract(dow from p_date)::int + 1] || ')'
    else to_char(p_date, 'DD.MM.YYYY') || ' (' || (array['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'])[extract(dow from p_date)::int + 1] || ')'
  end
$$;

create or replace function notification_text(p_kind text, p_lang text, b bookings, s shops)
returns text language plpgsql immutable as $$
declare
  when_txt text := tg_date_label(b.date, p_lang) || ' · ' || tg_time_label(b.start_min) || '–' || tg_time_label(b.start_min + b.duration_min);
  svc text := tg_escape(array_to_string(b.service_names, ', '));
  shop text := tg_escape(s.name);
  who text := tg_escape(b.client_name) || case when b.client_phone <> '' then ' · ' || tg_escape(b.client_phone) else '' end;
  note text := case when b.note <> '' then E'\n💬 ' || tg_escape(b.note) else '' end;
  link text := 'https://barber.vercel.app/b/' || b.token;
begin
  return case p_kind
    -- to the barber
    when 'new_booking' then '🆕 <b>' || case p_lang when 'en' then 'New booking' when 'uz' then 'Yangi yozuv' else 'Новая запись' end || '</b>'
      || E'\n👤 ' || who || E'\n✂️ ' || svc || E'\n🕒 ' || when_txt || note
    when 'client_cancelled' then '❌ <b>' || case p_lang when 'en' then 'Client cancelled' when 'uz' then 'Mijoz bekor qildi' else 'Клиент отменил запись' end || '</b>'
      || E'\n👤 ' || who || E'\n✂️ ' || svc || E'\n🕒 ' || when_txt
    -- to the client
    when 'confirmed' then case p_lang
      when 'en' then '✅ <b>You are booked at ' || shop || '</b>' || E'\n✂️ ' || svc || E'\n🕒 ' || when_txt || E'\n📍 ' || tg_escape(s.address) || E'\n\nManage your booking: ' || link
      when 'uz' then '✅ <b>' || shop || ' ga yozildingiz</b>' || E'\n✂️ ' || svc || E'\n🕒 ' || when_txt || E'\n📍 ' || tg_escape(s.address) || E'\n\nYozuvni boshqarish: ' || link
      else '✅ <b>Вы записаны в ' || shop || '</b>' || E'\n✂️ ' || svc || E'\n🕒 ' || when_txt || E'\n📍 ' || tg_escape(s.address) || E'\n\nУправление записью: ' || link end
    when 'reminder' then case p_lang
      when 'en' then '⏰ <b>Reminder: ' || shop || '</b>' || E'\n✂️ ' || svc || E'\n🕒 ' || when_txt || E'\n📍 ' || tg_escape(s.address) || E'\n\nCan''t make it? Cancel here: ' || link
      when 'uz' then '⏰ <b>Eslatma: ' || shop || '</b>' || E'\n✂️ ' || svc || E'\n🕒 ' || when_txt || E'\n📍 ' || tg_escape(s.address) || E'\n\nKela olmaysizmi? Bekor qiling: ' || link
      else '⏰ <b>Напоминание: ' || shop || '</b>' || E'\n✂️ ' || svc || E'\n🕒 ' || when_txt || E'\n📍 ' || tg_escape(s.address) || E'\n\nНе успеваете? Отмените здесь: ' || link end
    when 'barber_cancelled' then case p_lang
      when 'en' then '❌ <b>' || shop || ' cancelled your visit</b>' || E'\n🕒 ' || when_txt || E'\n\nBook a new time: https://barber.vercel.app/' || s.slug
      when 'uz' then '❌ <b>' || shop || ' tashrifingizni bekor qildi</b>' || E'\n🕒 ' || when_txt || E'\n\nYangi vaqt tanlang: https://barber.vercel.app/' || s.slug
      else '❌ <b>' || shop || ' отменил вашу запись</b>' || E'\n🕒 ' || when_txt || E'\n\nВыберите новое время: https://barber.vercel.app/' || s.slug end
    when 'review_request' then case p_lang
      when 'en' then '💈 Thanks for visiting <b>' || shop || '</b>! How was it? Leave a rating: ' || link
      when 'uz' then '💈 <b>' || shop || '</b> ga tashrifingiz uchun rahmat! Qanday o''tdi? Baho qoldiring: ' || link
      else '💈 Спасибо за визит в <b>' || shop || '</b>! Как всё прошло? Оставьте оценку: ' || link end
    else '' end;
end $$;

create or replace function enqueue_notification(p_shop uuid, p_booking uuid, p_kind text, p_chat bigint, p_text text, p_after timestamptz default now())
returns void language sql as $$
  insert into notifications (shop_id, booking_id, kind, chat_id, text, send_after)
  select p_shop, p_booking, p_kind, p_chat, p_text, p_after where p_chat is not null and p_text <> ''
$$;

-- Local wall-clock start of a booking as an instant.
create or replace function booking_starts_at(b bookings, s shops) returns timestamptz language sql immutable as $$
  select (b.date + make_interval(mins => b.start_min)) at time zone s.timezone
$$;

create or replace function bookings_notify_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare
  s shops;
  h int;
  lang_barber text := 'ru';
  by_owner boolean;
begin
  select * into s from shops where id = new.shop_id;
  by_owner := (select auth.uid()) is not null and (select auth.uid()) = s.owner_id;

  if tg_op = 'INSERT' then
    if new.status = 'booked' and new.source = 'online' then
      if s.notify_new_booking then
        perform enqueue_notification(s.id, new.id, 'new_booking', s.owner_chat_id, notification_text('new_booking', lang_barber, new, s));
      end if;
      perform enqueue_notification(s.id, new.id, 'confirmed', new.client_chat_id, notification_text('confirmed', new.lang, new, s));
    end if;
    if new.status = 'booked' and new.client_chat_id is not null then
      foreach h in array s.reminder_hours loop
        if booking_starts_at(new, s) - make_interval(hours => h) > now() + interval '10 minutes' then
          perform enqueue_notification(s.id, new.id, 'reminder', new.client_chat_id, notification_text('reminder', new.lang, new, s),
                                       booking_starts_at(new, s) - make_interval(hours => h));
        end if;
      end loop;
    end if;
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'cancelled' then
      update notifications set status = 'cancelled' where booking_id = new.id and status = 'pending';
      if old.status = 'booked' then
        if by_owner then
          perform enqueue_notification(s.id, new.id, 'barber_cancelled', new.client_chat_id, notification_text('barber_cancelled', new.lang, new, s));
        else
          perform enqueue_notification(s.id, new.id, 'client_cancelled', s.owner_chat_id, notification_text('client_cancelled', lang_barber, new, s));
        end if;
        -- A freed slot: tell people waiting for that day.
        update waitlist set status = 'notified' where shop_id = s.id and date = new.date and status = 'waiting' and client_chat_id is not null
          and (select enqueue_notification(s.id, null, 'slot_freed', client_chat_id,
                 case lang when 'en' then '🎉 A time just opened up at <b>' || tg_escape(s.name) || '</b> on ' || tg_date_label(new.date, 'en') || '. Book now: https://barber.vercel.app/' || s.slug
                           when 'uz' then '🎉 <b>' || tg_escape(s.name) || '</b> da ' || tg_date_label(new.date, 'uz') || ' kuni vaqt bo''shadi. Yoziling: https://barber.vercel.app/' || s.slug
                           else '🎉 В <b>' || tg_escape(s.name) || '</b> освободилось время на ' || tg_date_label(new.date, 'ru') || '. Записаться: https://barber.vercel.app/' || s.slug end)) is null;
      end if;
    elsif new.status = 'done' and new.client_chat_id is not null and new.source = 'online' then
      perform enqueue_notification(s.id, new.id, 'review_request', new.client_chat_id, notification_text('review_request', new.lang, new, s), now() + interval '1 hour');
    end if;
  end if;
  -- Client linked their Telegram after booking: schedule the reminders now.
  if old.client_chat_id is null and new.client_chat_id is not null and new.status = 'booked' then
    foreach h in array s.reminder_hours loop
      if booking_starts_at(new, s) - make_interval(hours => h) > now() + interval '10 minutes' then
        perform enqueue_notification(s.id, new.id, 'reminder', new.client_chat_id, notification_text('reminder', new.lang, new, s),
                                     booking_starts_at(new, s) - make_interval(hours => h));
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists bookings_notify on bookings;
create trigger bookings_notify after insert or update on bookings
  for each row execute function bookings_notify_trigger();

-- ── Telegram login verification inside Postgres (used by create_booking) ────
-- Returns the Telegram user id when `p` is a valid Login Widget payload signed by our bot,
-- otherwise null. Needs the token in Vault; without it nothing is trusted.
create or replace function telegram_bot_token() returns text language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v using 'telegram_bot_token';
  return v;
exception when others then return null;
end $$;
revoke all on function telegram_bot_token() from public;

create or replace function verify_telegram_login(p jsonb) returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  tok text := telegram_bot_token();
  check_str text;
  calc text;
begin
  if tok is null or p is null or p->>'hash' is null or p->>'id' is null then return null; end if;
  if (p->>'auth_date')::bigint < extract(epoch from now())::bigint - 86400 then return null; end if;
  select string_agg(key || '=' || value, E'\n' order by key) into check_str
    from jsonb_each_text(p - 'hash');
  calc := encode(hmac(check_str, digest(tok, 'sha256'), 'sha256'), 'hex');
  if calc <> (p->>'hash') then return null; end if;
  return (p->>'id')::bigint;
end $$;
revoke all on function verify_telegram_login(jsonb) from public;

-- ── Booking rules: buffer, closed dates, blocked clients, Telegram identity ─
drop function if exists create_booking(uuid, uuid[], date, int, text, text, text);
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
  select * into v_shop from shops where id = p_shop;
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
    insert into bookings (shop_id, date, start_min, duration_min, service_ids, service_names, total_price, client_name, client_phone, note, lang, client_chat_id, telegram_user_id)
    values (p_shop, p_date, p_start_min, v_duration, p_service_ids, v_names, v_price, trim(p_name), trim(p_phone), left(coalesce(p_note, ''), 500),
            case when p_lang in ('uz', 'ru', 'en') then p_lang else 'ru' end, v_chat, v_tg)
    returning token into v_token;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;
  update waitlist set status = 'booked' where shop_id = p_shop and date = p_date and status in ('waiting', 'notified') and client_key(client_phone, client_name) = v_key;
  return v_token;
end $$;
grant execute on function create_booking(uuid, uuid[], date, int, text, text, text, text, jsonb) to anon, authenticated;

-- Cancellation policy: clients may cancel only until `cancel_hours` before the start.
create or replace function cancel_booking(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings; s shops;
begin
  select * into b from bookings where token = p_token;
  if not found or b.status <> 'booked' then raise exception 'cannot_cancel'; end if;
  select * into s from shops where id = b.shop_id;
  if booking_starts_at(b, s) - make_interval(hours => s.cancel_hours) < now() then raise exception 'too_late_to_cancel'; end if;
  update bookings set status = 'cancelled' where id = b.id;
end $$;

-- get_booking also tells the client whether Telegram is linked and the cancel deadline.
create or replace function get_booking(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', b.id, 'token', b.token, 'shop_id', b.shop_id, 'date', b.date, 'start_min', b.start_min,
    'duration_min', b.duration_min, 'service_ids', b.service_ids, 'service_names', b.service_names, 'total_price', b.total_price,
    'client_name', b.client_name, 'status', b.status, 'lang', b.lang,
    'telegram_linked', b.client_chat_id is not null,
    'cancel_until', booking_starts_at(b, s) - make_interval(hours => s.cancel_hours),
    'reviewed', exists (select 1 from reviews r where r.booking_id = b.id),
    'shop_slug', s.slug, 'shop_name', s.name, 'timezone', s.timezone)
  from bookings b join shops s on s.id = b.shop_id where b.token = p_token
$$;

-- ── Daily summary for the barber (enqueued hourly, sent at the shop's local hour) ──
create or replace function enqueue_daily_summaries() returns int language plpgsql security definer set search_path = public as $$
declare s shops; n int := 0; today date; body text; cnt int;
begin
  for s in select * from shops where owner_chat_id is not null and daily_summary_hour is not null loop
    if extract(hour from now() at time zone s.timezone)::int <> s.daily_summary_hour then continue; end if;
    today := (now() at time zone s.timezone)::date;
    if exists (select 1 from notifications where shop_id = s.id and kind = 'daily_summary' and (created_at at time zone s.timezone)::date = today) then continue; end if;
    select count(*), string_agg('• ' || tg_time_label(start_min) || ' ' || tg_escape(client_name) || ' — ' || tg_escape(array_to_string(service_names, ', ')), E'\n' order by start_min)
      into cnt, body from bookings where shop_id = s.id and date = today and status = 'booked';
    perform enqueue_notification(s.id, null, 'daily_summary', s.owner_chat_id,
      '📅 <b>' || tg_date_label(today, 'ru') || '</b> · ' || cnt || ' ' || case when cnt = 1 then 'запись' when cnt between 2 and 4 then 'записи' else 'записей' end
      || case when cnt > 0 then E'\n' || body else E'\nСвободный день.' end);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Dispatcher (pg_net + pg_cron where available) ───────────────────────────
create or replace function claim_notifications(p_limit int default 50)
returns setof notifications language sql security definer set search_path = public as $$
  with due as (
    select id from notifications where status = 'pending' and send_after <= now() order by send_after limit p_limit for update skip locked
  )
  update notifications n set status = 'sending', attempts = attempts + 1 from due where n.id = due.id returning n.*
$$;
revoke all on function claim_notifications(int) from public;

create or replace function finish_notification(p_id bigint, p_ok boolean, p_error text default null, p_request bigint default null)
returns void language sql security definer set search_path = public as $$
  update notifications set
    status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
    sent_at = case when p_ok then now() else sent_at end,
    send_after = case when p_ok then send_after else now() + make_interval(mins => 2 * attempts) end,
    error = p_error, request_id = coalesce(p_request, request_id)
  where id = p_id
$$;
revoke all on function finish_notification(bigint, boolean, text, bigint) from public;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    execute $fn$
      create or replace function dispatch_notifications() returns int language plpgsql security definer set search_path = public as $body$
      declare tok text := telegram_bot_token(); r notifications; req bigint; n int := 0;
      begin
        if tok is null then return 0; end if;
        for r in select * from claim_notifications(50) loop
          select net.http_post(
            url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
            headers := '{"Content-Type":"application/json"}'::jsonb,
            body := jsonb_build_object('chat_id', r.chat_id, 'text', r.text, 'parse_mode', 'HTML', 'disable_web_page_preview', true)
          ) into req;
          perform finish_notification(r.id, true, null, req);
          n := n + 1;
        end loop;
        return n;
      end $body$;
    $fn$;
    execute 'revoke all on function dispatch_notifications() from public';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobname) from cron.job where jobname in ('barber_dispatch_notifications', 'barber_daily_summaries');
    perform cron.schedule('barber_dispatch_notifications', '* * * * *', 'select dispatch_notifications()');
    perform cron.schedule('barber_daily_summaries', '0 * * * *', 'select enqueue_daily_summaries()');
  end if;
end $$;
