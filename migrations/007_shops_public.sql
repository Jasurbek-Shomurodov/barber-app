-- Public shop data moves behind a view. Apply after 006.
--
-- Until now shops_public_read let anyone select every column of an approved shop, including
-- telegram_link_code and owner_chat_id, and /start s_<code> in the bot links whoever sends the
-- code. A client could take over a shop's Telegram notifications and read client names and
-- phones. From here:
--   shops_public   the columns the booking page needs, for approved shops (plus the barber's own
--                  and the admin's). Runs with the owner's privileges, so it ignores the table
--                  policy below and filters on its own where clause.
--   shops          select only for the barber's own row and the platform admin; anon has no
--                  select privilege at all. Policies on other tables that anon reaches
--                  (services, reviews) no longer touch shops directly but go through
--                  shop_approved() / shop_owned(), which are security definer.
--   link codes     every telegram_link_code is rotated, since the old ones were readable.

create or replace function shop_approved(p_shop uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shops where id = p_shop and status = 'approved')
$$;
create or replace function shop_owned(p_shop uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shops where id = p_shop and owner_id = (select auth.uid()))
$$;
grant execute on function shop_approved(uuid), shop_owned(uuid) to anon, authenticated;

-- ── The public view ─────────────────────────────────────────────────────────
create or replace view shops_public as
  select id, slug, name, tagline, address, phone, timezone, currency, status, created_at,
         hours, slot_step, lead_min, buffer_min, booking_days, cancel_hours, closed_dates,
         instagram, telegram, maps_url
  from shops
  where status = 'approved' or owner_id = (select auth.uid()) or is_platform_admin();
grant select on shops_public to anon, authenticated;

-- ── The table: owner and admin only ─────────────────────────────────────────
drop policy if exists shops_public_read on shops;
drop policy if exists shops_owner_read on shops;
create policy shops_owner_read on shops for select
  using (owner_id = (select auth.uid()) or is_platform_admin());
revoke select on shops from anon;

-- Policies anon reaches must not read shops with anon's own privileges.
drop policy if exists services_public_read on services;
create policy services_public_read on services for select
  using ((active and not archived and shop_approved(shop_id)) or shop_owned(shop_id));
drop policy if exists reviews_public_read on reviews;
create policy reviews_public_read on reviews for select
  using (not hidden or shop_owned(shop_id));

-- ── Rotate every link code ──────────────────────────────────────────────────
update shops set telegram_link_code = encode(gen_random_bytes(8), 'hex');
