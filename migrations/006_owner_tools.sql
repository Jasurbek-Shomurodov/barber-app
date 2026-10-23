-- Owner tools. Apply after 005.
--   shop_events:         audit log per shop (created, status changes with who and when, admin notes).
--                        Readable by the platform admin, and by the shop's barber
--                        except the admin's notes; written only by triggers
--                        and admin RPCs.
--   admin_add_note:      the admin's free-text note on a shop, kept in the log.
--   admin_list_shops:    gains the approval checklist fields (address, phone, Telegram) and the last note.
--   admin_shop_overview: a read-only picture of one shop for /owner/:id — settings, services and
--                        upcoming bookings as times only. No client names or phones leave this RPC.

-- ── Audit log ───────────────────────────────────────────────────────────────
create table if not exists shop_events (
  id bigserial primary key,
  shop_id uuid not null references shops(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('created', 'status', 'note')),
  from_status text,
  to_status text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists shop_events_shop_idx on shop_events (shop_id, id desc);
alter table shop_events enable row level security;
drop policy if exists shop_events_read on shop_events;
create policy shop_events_read on shop_events for select
  using (is_platform_admin() or (kind <> 'note' and exists (select 1 from shops s where s.id = shop_id and s.owner_id = (select auth.uid()))));
-- no insert/update/delete policies: triggers and security-definer RPCs only

create or replace function shops_log_event() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into shop_events (shop_id, actor_id, kind, to_status) values (new.id, (select auth.uid()), 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into shop_events (shop_id, actor_id, kind, from_status, to_status) values (new.id, (select auth.uid()), 'status', old.status, new.status);
  end if;
  return new;
end $$;
drop trigger if exists shops_log_event on shops;
create trigger shops_log_event after insert or update of status on shops for each row execute function shops_log_event();

create or replace function admin_add_note(p_shop uuid, p_note text)
returns shop_events language plpgsql security definer set search_path = public as $$
declare v shop_events;
begin
  if not is_platform_admin() then raise exception 'not_allowed'; end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'note_required'; end if;
  if not exists (select 1 from shops where id = p_shop) then raise exception 'shop_not_found'; end if;
  insert into shop_events (shop_id, actor_id, kind, note) values (p_shop, (select auth.uid()), 'note', left(trim(p_note), 1000)) returning * into v;
  return v;
end $$;

-- ── Shop list with the approval checklist ───────────────────────────────────
-- The return type changes, so the function is dropped first (create or replace cannot).
drop function if exists admin_list_shops();
create function admin_list_shops()
returns table (
  id uuid, slug text, name text, status text, created_at timestamptz, timezone text, currency text,
  owner_name text, owner_phone text, owner_telegram text,
  address text, phone text, telegram_linked boolean, last_note text,
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
    s.address, s.phone, s.owner_chat_id is not null,
    coalesce((select e.note from shop_events e where e.shop_id = s.id and e.kind = 'note' order by e.id desc limit 1), '')::text,
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

-- ── Read-only view of one shop ──────────────────────────────────────────────
-- Bookings come back as times, services and status only: the admin sees how busy a shop is,
-- never who its clients are.
create or replace function admin_shop_overview(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s shops; v_today date; v_out jsonb;
begin
  if not is_platform_admin() then raise exception 'not_allowed'; end if;
  select * into s from shops where id = p_shop;
  if not found then raise exception 'shop_not_found'; end if;
  v_today := (now() at time zone s.timezone)::date;
  select jsonb_build_object(
    'shop', jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'status', s.status, 'tagline', s.tagline, 'address', s.address, 'phone', s.phone,
      'instagram', s.instagram, 'telegram', s.telegram, 'maps_url', s.maps_url, 'timezone', s.timezone, 'currency', s.currency,
      'hours', s.hours, 'slot_step', s.slot_step, 'lead_min', s.lead_min, 'buffer_min', s.buffer_min, 'cancel_hours', s.cancel_hours,
      'booking_days', s.booking_days, 'closed_dates', to_jsonb(s.closed_dates), 'telegram_linked', s.owner_chat_id is not null,
      'reminder_hours', to_jsonb(s.reminder_hours), 'created_at', s.created_at,
      'owner_name', coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(ta.first_name, ''), ''),
      'owner_phone', coalesce(nullif(u.raw_user_meta_data->>'phone', ''), nullif(s.phone, ''), ''),
      'owner_telegram', coalesce(ta.username, '')),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'category', v.category, 'duration_min', v.duration_min, 'price', v.price, 'active', v.active) order by v.sort, v.name)
                          from services v where v.shop_id = s.id and not v.archived), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object('date', b.date, 'start_min', b.start_min, 'duration_min', b.duration_min, 'service_names', to_jsonb(b.service_names), 'total_price', b.total_price, 'status', b.status, 'source', b.source) order by b.date, b.start_min)
                          from bookings b where b.shop_id = s.id and b.status in ('booked', 'blocked') and b.date between v_today and v_today + 14), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'from_status', e.from_status, 'to_status', e.to_status, 'note', e.note, 'created_at', e.created_at, 'by_admin', exists (select 1 from platform_admins a where a.user_id = e.actor_id)) order by e.id desc)
                        from (select * from shop_events e where e.shop_id = s.id order by e.id desc limit 100) e), '[]'::jsonb)
  ) into v_out
  from shops x left join auth.users u on u.id = x.owner_id left join telegram_accounts ta on ta.user_id = x.owner_id
  where x.id = s.id;
  return v_out;
end $$;

revoke all on function admin_list_shops(), admin_add_note(uuid, text), admin_shop_overview(uuid) from public;
grant execute on function admin_list_shops(), admin_add_note(uuid, text), admin_shop_overview(uuid) to authenticated;
