-- Site address used in Telegram message links, kept in one setting instead of hard-coded.
-- Change it later with:  update app_settings set value = 'https://your-domain' where key = 'base_url';

create table if not exists app_settings (
  key text primary key,
  value text not null
);
alter table app_settings enable row level security; -- service role / SQL editor only
insert into app_settings (key, value) values ('base_url', 'https://barberuz.vercel.app')
  on conflict (key) do update set value = excluded.value;

create or replace function app_base_url() returns text language sql stable security definer set search_path = public as $$
  select rtrim(coalesce((select value from app_settings where key = 'base_url'), 'https://barberuz.vercel.app'), '/')
$$;

create or replace function notification_text(p_kind text, p_lang text, b bookings, s shops)
returns text language plpgsql stable as $$
declare
  when_txt text := tg_date_label(b.date, p_lang) || ' · ' || tg_time_label(b.start_min) || '–' || tg_time_label(b.start_min + b.duration_min);
  svc text := tg_escape(array_to_string(b.service_names, ', '));
  shop text := tg_escape(s.name);
  who text := tg_escape(b.client_name) || case when b.client_phone <> '' then ' · ' || tg_escape(b.client_phone) else '' end;
  note text := case when b.note <> '' then E'\n💬 ' || tg_escape(b.note) else '' end;
  link text := '' || app_base_url() || '/b/' || b.token;
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
      when 'en' then '❌ <b>' || shop || ' cancelled your visit</b>' || E'\n🕒 ' || when_txt || E'\n\nBook a new time: ' || app_base_url() || '/' || s.slug
      when 'uz' then '❌ <b>' || shop || ' tashrifingizni bekor qildi</b>' || E'\n🕒 ' || when_txt || E'\n\nYangi vaqt tanlang: ' || app_base_url() || '/' || s.slug
      else '❌ <b>' || shop || ' отменил вашу запись</b>' || E'\n🕒 ' || when_txt || E'\n\nВыберите новое время: ' || app_base_url() || '/' || s.slug end
    when 'review_request' then case p_lang
      when 'en' then '💈 Thanks for visiting <b>' || shop || '</b>! How was it? Leave a rating: ' || link
      when 'uz' then '💈 <b>' || shop || '</b> ga tashrifingiz uchun rahmat! Qanday o''tdi? Baho qoldiring: ' || link
      else '💈 Спасибо за визит в <b>' || shop || '</b>! Как всё прошло? Оставьте оценку: ' || link end
    else '' end;
end $$;

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
                 case lang when 'en' then '🎉 A time just opened up at <b>' || tg_escape(s.name) || '</b> on ' || tg_date_label(new.date, 'en') || '. Book now: ' || app_base_url() || '/' || s.slug
                           when 'uz' then '🎉 <b>' || tg_escape(s.name) || '</b> da ' || tg_date_label(new.date, 'uz') || ' kuni vaqt bo''shadi. Yoziling: ' || app_base_url() || '/' || s.slug
                           else '🎉 В <b>' || tg_escape(s.name) || '</b> освободилось время на ' || tg_date_label(new.date, 'ru') || '. Записаться: ' || app_base_url() || '/' || s.slug end)) is null;
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
