// Applies every migration to an in-memory Postgres (PGlite) and exercises the public RPCs:
// double-booking, buffer, cancellation policy, blocked clients, closed dates, the notification
// queue, the waitlist and roles (admin approval, client accounts, no entries in the past). Run: npm run sql:check
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const dir = path.resolve(new URL('.', import.meta.url).pathname, '../migrations')
const db = new PGlite({ extensions: { btree_gist, pgcrypto } })
await db.exec(`create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create role anon; create role authenticated;`)
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  console.log('applied', f)
}
const q = async (sql, params) => (await db.query(sql, params)).rows
const fails = async (sql, params, code) => {
  try { await db.query(sql, params) } catch (e) { assert.match(e.message, new RegExp(code), `${code} expected`); return }
  assert.fail(`${code} expected, call succeeded`)
}
const uid = '11111111-1111-1111-1111-111111111111'
const admin = '22222222-2222-2222-2222-222222222222'
const client = '33333333-3333-3333-3333-333333333333'
await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${uid}', '{"full_name":"Barber Bek","phone":"+998901112233"}'), ('${admin}', '{}'), ('${client}', '{}');
insert into platform_admins values ('${admin}'); insert into telegram_accounts (telegram_id, user_id) values (4242, '${admin}');
set test.uid = '${uid}';`)
const [shop] = await q(`select * from create_my_shop('my-shop', 'My Shop')`)
assert.equal(shop.status, 'pending', 'a new barber waits for approval')
await fails(`select create_my_shop('owner', 'Hidden')`, [], 'slug_taken')
await fails(`update shops set status = 'approved' where id = $1`, [shop.id], 'not_allowed')
await fails(`select * from admin_list_shops()`, [], 'not_allowed')
await q(`update shops set hours = (select jsonb_agg(jsonb_build_object('day', d, 'open', 0, 'close', 1440, 'off', false)) from generate_series(0,6) d), lead_min = 0, buffer_min = 10, owner_chat_id = 777 where id = $1`, [shop.id])
const svc = (await q(`insert into services (shop_id, name, duration_min, price) values ($1,'Cut',45,80000),($1,'Beard',25,50000) returning id`, [shop.id])).map((r) => r.id)
const [{ d: day }] = await q(`select ((now() at time zone 'Asia/Tashkent')::date + 2)::text d`)
const [{ d: yesterday }] = await q(`select ((now() at time zone 'Asia/Tashkent')::date - 1)::text d`)
await fails(`insert into bookings (shop_id, date, start_min, duration_min, status, source) values ($1, $2::date, 600, 30, 'blocked', 'barber')`, [shop.id, yesterday], 'time_passed')
await db.exec(`set test.uid = ''`)
await fails(`select create_booking($1, $2::uuid[], $3::date, 600, 'Aziz', '+998 90 123 45 67')`, [shop.id, svc, day], 'shop_not_found')

await db.exec(`set test.uid = '${admin}'`)
const listed = await q(`select * from admin_list_shops()`)
assert.deepEqual(listed.map((r) => [r.slug, r.status, r.owner_name, r.services]), [['my-shop', 'pending', 'Barber Bek', 2]])
await q(`select admin_set_shop_status($1, 'approved')`, [shop.id])
assert.deepEqual(await q(`select kind, chat_id::int c from notifications order by id`), [{ kind: 'new_barber', c: 4242 }, { kind: 'shop_approved', c: 777 }])
await q(`delete from notifications`)
await db.exec(`set test.uid = ''`) // anonymous client from here

const [{ t: tok }] = await q(`select create_booking($1, $2::uuid[], $3::date, 600, 'Aziz', '+998 90 123 45 67', 'short', 'uz') t`, [shop.id, svc, day])
assert.equal(tok.length, 24)
await fails(`select create_booking($1, $2::uuid[], $3::date, 630, 'Bek', '+998 90 000 00 00')`, [shop.id, [svc[0]], day], 'slot_taken')
await fails(`select create_booking($1, $2::uuid[], $3::date, 675, 'Bek', '+998 90 000 00 00')`, [shop.id, [svc[1]], day], 'slot_taken') // inside the 10 min buffer
assert.deepEqual((await q(`select kind, chat_id::int c from notifications order by id`)), [{ kind: 'new_booking', c: 777 }])
assert.equal((await q(`select get_booking($1) b`, [tok]))[0].b.client_phone, undefined, 'phone never leaves get_booking')
assert.equal((await q(`select * from get_busy($1, $2::date, $2::date)`, [shop.id, day])).length, 1)

await q(`update bookings set client_chat_id = 555 where token = $1`, [tok])
assert.equal((await q(`select count(*)::int n from notifications where kind = 'reminder' and status = 'pending'`))[0].n, 2)
await fails(`select submit_review($1, 5, 'great')`, [tok], 'too_early')

await q(`select join_waitlist($1, $2::date, 'Wait Guy', '+998 91 111 11 11', 'en')`, [shop.id, day])
await q(`update waitlist set client_chat_id = 999`)
await q(`select cancel_booking($1)`, [tok])
await fails(`select cancel_booking($1)`, [tok], 'cannot_cancel')
const after = await q(`select kind, status from notifications order by id`)
assert.deepEqual(after.filter((n) => n.kind === 'reminder').map((n) => n.status), ['cancelled', 'cancelled'])
assert.ok(after.some((n) => n.kind === 'client_cancelled' && n.status === 'pending'))
assert.ok(after.some((n) => n.kind === 'slot_freed'))
assert.equal((await q(`select status from waitlist`))[0].status, 'notified')

await q(`update shops set cancel_hours = 100 where id = $1`, [shop.id])
const [{ t: tok2 }] = await q(`select create_booking($1, $2::uuid[], $3::date, 900, 'Late', '+998 90 222 22 22') t`, [shop.id, [svc[0]], day])
await fails(`select cancel_booking($1)`, [tok2], 'too_late_to_cancel')
await q(`update bookings set status = 'done' where token = $1`, [tok2])
await q(`select submit_review($1, 5, 'great')`, [tok2])
await fails(`select submit_review($1, 4, 'again')`, [tok2], 'already_reviewed')
assert.deepEqual((await q(`select get_public_stats($1) s`, [shop.id]))[0].s, { visits: 1, clients: 1, avg_rating: 5, review_count: 1 })

await db.exec(`set test.uid = '${uid}'`)
await q(`insert into client_notes (shop_id, client_key, blocked) values ($1, client_key('+998 90 333 33 33', 'x'), true)`, [shop.id])
await db.exec(`set test.uid = ''`)
await fails(`select create_booking($1, $2::uuid[], $3::date, 1000, 'Bad', '90 333 33 33')`, [shop.id, [svc[0]], day], 'client_blocked')
await q(`update shops set closed_dates = array[$2::date] where id = $1`, [shop.id, day])
await fails(`select create_booking($1, $2::uuid[], $3::date, 1100, 'Closed', '90 444 44 44')`, [shop.id, [svc[0]], day], 'outside_hours')
await fails(`select create_booking($1, $2::uuid[], ((now() at time zone 'Asia/Tashkent')::date - 1), 700, 'Bek', '90 111 22 33')`, [shop.id, [svc[1]]], 'date_out_of_range')
assert.ok((await q(`select count(*)::int n from claim_notifications(10)`))[0].n >= 1)
const [{ text: link }] = await q(`select text from notifications where kind = 'confirmed' or kind = 'reminder' limit 1`)
assert.match(link, /https:\/\/barberuz\.vercel\.app\/b\//, 'links use app_settings.base_url')
assert.ok(!(await q(`select text from notifications`)).some((r) => r.text.includes('barber.vercel.app/')), 'no hard-coded old domain')

await q(`update shops set closed_dates = '{}' where id = $1`, [shop.id])
await db.exec(`set test.uid = '${client}'`)
const [{ t: mine }] = await q(`select create_booking($1, $2::uuid[], $3::date, 1200, 'Signed In', '+998 90 555 55 55') t`, [shop.id, [svc[1]], day])
const own = await q(`select * from my_bookings()`)
assert.deepEqual(own.map((r) => [r.token, r.shop_slug]), [[mine, 'my-shop']], 'a client sees only their own bookings')
assert.equal(own[0].client_phone, undefined, 'my_bookings never returns phones')
await db.exec(`set test.uid = ''`)
assert.equal((await q(`select count(*)::int n from my_bookings()`))[0].n, 0, 'anonymous callers see nothing')
console.log('migrations ok')
