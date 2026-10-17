// Demo backend: the same API as supabaseApi.js, kept in this browser's localStorage and
// seeded with a sample shop, so the app is fully usable before a Supabase project exists.
// It enforces the same rules as the SQL functions (see migrations/001_init.sql).

import { DEFAULT_HOURS, availableStarts, slotOptionsFor } from './slots.js'
import { clientKey } from './stats.js'
import { addDays, nowInZone } from './time.js'

const KEY = 'nb-demo-v2'
const TZ = 'Asia/Tashkent'
const id = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms))

/** Local wall-clock (date, minute) in a timezone → instant. */
function zonedToUtc(date, minute, timeZone) {
  const guess = new Date(`${date}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00Z`)
  const local = nowInZone(timeZone, guess)
  const [h, m] = [Math.floor(local.minute / 60), local.minute % 60]
  const asIfUtc = new Date(`${local.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  return new Date(guess.getTime() - (asIfUtc.getTime() - guess.getTime()))
}

function fail(code) {
  const e = new Error(code)
  e.code = code
  throw e
}

function seed() {
  const shopId = id()
  const shop = {
    id: shopId, slug: 'demo', name: 'Sardor Barber', tagline: 'Classic cuts · Fades · Hot towel shave',
    address: 'Tashkent, Amir Temur 15', phone: '+998 90 123 45 67', timezone: TZ, currency: 'UZS',
    slot_step: 15, lead_min: 30, booking_days: 21, hours: DEFAULT_HOURS.map((h) => ({ ...h })),
    buffer_min: 0, cancel_hours: 2, closed_dates: [], instagram: 'sardor.barber', telegram: 'sardorbarber', maps_url: 'https://yandex.com/maps/?text=Tashkent%20Amir%20Temur%2015',
    owner_chat_id: null, telegram_link_code: 'demo1234', notify_new_booking: true, daily_summary_hour: 8, reminder_hours: [24, 2],
  }
  const svc = (name, duration_min, price, description, sort, category = '') => ({ id: id(), shop_id: shopId, name, duration_min, price, description, active: true, archived: false, sort, category })
  const services = [
    svc('Haircut', 45, 80000, 'Consultation, wash, cut and styling', 1, 'Hair'),
    svc('Fade', 50, 90000, 'Skin or low fade with clipper and scissors', 2, 'Hair'),
    svc('Kids haircut', 30, 50000, 'Under 12 years', 3, 'Hair'),
    svc('Beard trim', 25, 50000, 'Shape-up, line-up and beard oil', 4, 'Beard'),
    svc('Hot towel shave', 35, 60000, 'Straight razor shave with hot towels', 5, 'Beard'),
  ]
  const names = ['Aziz', 'Bekzod', 'Jamshid', 'Timur', 'Rustam', 'Dilshod', 'Sherzod', 'Otabek', 'Javohir', 'Kamron', 'Ulugbek', 'Farrukh', 'Nodir', 'Sanjar']
  const phones = names.map((_, i) => `+998 9${i % 10} ${String(200 + i * 37).slice(0, 3)} ${String(10 + i * 7).slice(0, 2)} ${String(40 + i * 3).slice(0, 2)}`)
  const today = nowInZone(TZ).date
  const bookings = []
  let n = 0
  for (let d = -75; d <= 6; d++) {
    const date = addDays(today, d)
    const day = shop.hours.find((h) => h.day === new Date(date + 'T00:00:00Z').getUTCDay())
    if (day.off) continue
    let t = day.open + (Math.abs(d * 7) % 3) * 15
    const perDay = d < 0 ? 3 + (Math.abs(d) % 3) : 2 + (d % 2)
    for (let k = 0; k < perDay && t < day.close - 60; k++) {
      const s = services[(n + k) % services.length]
      const extra = n % 4 === 0 && s.name !== 'Beard trim' ? services[3] : null
      const picked = extra ? [s, extra] : [s]
      const ci = (n * 5 + k * 3) % names.length
      const status = d < 0 ? (n % 17 === 0 ? 'no_show' : n % 13 === 0 ? 'cancelled' : 'done') : 'booked'
      bookings.push({
        id: id(), shop_id: shopId, token: token(), date, start_min: t,
        duration_min: picked.reduce((a, x) => a + x.duration_min, 0),
        service_ids: picked.map((x) => x.id), service_names: picked.map((x) => x.name),
        total_price: picked.reduce((a, x) => a + x.price, 0),
        client_name: names[ci], client_phone: phones[ci], note: '', status, source: 'online', lang: 'ru', client_chat_id: ci % 3 === 0 ? 1000 + ci : null,
        created_at: new Date(Date.now() + d * 86400000).toISOString(),
      })
      t += picked.reduce((a, x) => a + x.duration_min, 0) + 30 + (n % 3) * 15
      n++
    }
  }
  const comments = [
    'Best fade in the city, always on time.',
    'Booked in 20 seconds, no calls needed. Great cut.',
    'Very clean place and friendly barber.',
    'Hot towel shave is a must try!',
    'Good haircut, had to wait 5 minutes.',
    'Лучший барбер, рекомендую!',
    'Juda zo‘r, rahmat!',
  ]
  const reviews = bookings.filter((b) => b.status === 'done').slice(-40).filter((_, i) => i % 5 === 0).map((b, i) => ({
    id: id(), shop_id: shopId, booking_id: b.id, rating: i % 6 === 4 ? 4 : 5, comment: comments[i % comments.length],
    client_name: b.client_name, hidden: false, created_at: new Date(b.date + 'T15:00:00Z').toISOString(),
  }))
  return { shops: [shop], services, bookings, reviews, waitlist: [], clientNotes: [], session: { user: { id: 'demo-owner', email: 'demo@barber.app' }, shopId } }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* storage unavailable: fall through to a fresh seed */ }
  const db = seed()
  save(db)
  return db
}

let cache = null
const db = () => (cache ||= load())
function save(next = cache) {
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* in-memory only */ }
}

const shopById = (shopId) => db().shops.find((s) => s.id === shopId) || fail('shop_not_found')
const myShop = () => {
  const s = db().session
  return s ? db().shops.find((x) => x.id === s.shopId) || null : null
}
const requireOwner = (shopId) => {
  if (myShop()?.id !== shopId) fail('not_allowed')
}

export const demoApi = {
  mode: 'demo',

  async resetDemo() { localStorage.removeItem(KEY); cache = null; db() },

  // Public
  async getShopBySlug(slug) { await wait(); return db().shops.find((s) => s.slug === slug) || null },
  async listServices(shopId, { all = false } = {}) {
    await wait(120)
    return db().services.filter((s) => s.shop_id === shopId && !s.archived && (all || s.active)).sort((a, b) => a.sort - b.sort)
  },
  async getBusy(shopId, from, to) {
    await wait(120)
    return db().bookings.filter((b) => b.shop_id === shopId && b.date >= from && b.date <= to && b.status !== 'cancelled')
      .map(({ date, start_min, duration_min }) => ({ date, start_min, duration_min }))
  },
  async createBooking({ shopId, serviceIds, date, startMin, name, phone, note, lang = 'ru', telegram = null }) {
    await wait(350)
    const shop = shopById(shopId)
    if (String(name || '').trim().length < 2) fail('name_required')
    if (String(phone || '').replace(/\D/g, '').length < 7) fail('phone_required')
    const key = clientKey({ client_phone: phone, client_name: name })
    if ((db().clientNotes || []).some((c) => c.shop_id === shopId && c.client_key === key && c.blocked)) fail('client_blocked')
    const picked = db().services.filter((s) => s.shop_id === shopId && serviceIds.includes(s.id) && s.active && !s.archived).sort((a, b) => a.sort - b.sort)
    if (!picked.length || picked.length !== serviceIds.length) fail('service_unavailable')
    const duration = picked.reduce((a, s) => a + s.duration_min, 0)
    const now = nowInZone(shop.timezone)
    if (date < now.date || date > addDays(now.date, shop.booking_days)) fail('date_out_of_range')
    const busy = db().bookings.filter((b) => b.shop_id === shopId && b.date === date)
    if (!availableStarts({ date, ...slotOptionsFor(shop), duration, busy, step: 1, now }).includes(startMin)) fail('slot_taken')
    const chatId = telegram?.id ? Number(telegram.id) : (db().bookings.find((b) => clientKey(b) === key && b.client_chat_id)?.client_chat_id ?? null)
    const booking = {
      id: id(), shop_id: shopId, token: token(), date, start_min: startMin, duration_min: duration,
      service_ids: picked.map((s) => s.id), service_names: picked.map((s) => s.name),
      total_price: picked.reduce((a, s) => a + Number(s.price), 0),
      client_name: name.trim(), client_phone: phone.trim(), note: String(note || '').slice(0, 500),
      status: 'booked', source: 'online', lang, client_chat_id: chatId, created_at: new Date().toISOString(),
    }
    db().bookings.push(booking)
    for (const w of db().waitlist || []) if (w.shop_id === shopId && w.date === date && clientKey(w) === key && w.status !== 'cancelled') w.status = 'booked'
    save()
    return booking.token
  },
  async getBooking(tok) {
    await wait()
    const b = db().bookings.find((x) => x.token === tok)
    if (!b) return null
    const shop = shopById(b.shop_id)
    const { client_phone, note, client_chat_id, ...rest } = b
    const startsAt = zonedToUtc(b.date, b.start_min, shop.timezone)
    return {
      ...rest, shop_slug: shop.slug, shop_name: shop.name, timezone: shop.timezone, telegram_linked: client_chat_id != null,
      cancel_until: new Date(startsAt.getTime() - shop.cancel_hours * 3600000).toISOString(),
      reviewed: db().reviews.some((r) => r.booking_id === b.id),
    }
  },
  async cancelBooking(tok) {
    await wait()
    const b = db().bookings.find((x) => x.token === tok && x.status === 'booked') || fail('cannot_cancel')
    const shop = shopById(b.shop_id)
    if (zonedToUtc(b.date, b.start_min, shop.timezone).getTime() - shop.cancel_hours * 3600000 < Date.now()) fail('too_late_to_cancel')
    b.status = 'cancelled'
    for (const w of db().waitlist || []) if (w.shop_id === shop.id && w.date === b.date && w.status === 'waiting' && w.client_chat_id) w.status = 'notified'
    save()
  },
  async submitReview(tok, { rating, comment }) {
    await wait()
    const b = db().bookings.find((x) => x.token === tok) || fail('booking_not_found')
    if (['cancelled', 'no_show', 'blocked'].includes(b.status)) fail('cannot_review')
    const now = nowInZone(shopById(b.shop_id).timezone)
    if (b.status !== 'done' && (b.date > now.date || (b.date === now.date && b.start_min > now.minute))) fail('too_early')
    if (db().reviews.some((r) => r.booking_id === b.id)) fail('already_reviewed')
    db().reviews.push({ id: id(), shop_id: b.shop_id, booking_id: b.id, rating, comment: String(comment || '').slice(0, 1000), client_name: b.client_name, hidden: false, created_at: new Date().toISOString() })
    save()
  },
  async listReviews(shopId, { all = false } = {}) {
    await wait(150)
    return db().reviews.filter((r) => r.shop_id === shopId && (all || !r.hidden)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  },
  async getPublicStats(shopId) {
    await wait(150)
    const done = db().bookings.filter((b) => b.shop_id === shopId && b.status === 'done')
    const keys = new Set(done.map((b) => String(b.client_phone).replace(/\D/g, '').slice(-9) || b.client_name.toLowerCase()))
    const r = db().reviews.filter((x) => x.shop_id === shopId && !x.hidden)
    return { clients: keys.size, visits: done.length, avg_rating: r.length ? r.reduce((a, x) => a + x.rating, 0) / r.length : 0, review_count: r.length }
  },

  /** Demo stand-in for opening the bot deep link: marks the booking as linked. */
  async linkBookingTelegram(tok) {
    await wait()
    const b = db().bookings.find((x) => x.token === tok) || fail('booking_not_found')
    b.client_chat_id = b.client_chat_id || 1
    save()
  },
  async joinWaitlist({ shopId, date, name, phone, lang = 'ru' }) {
    await wait()
    if (String(name || '').trim().length < 2) fail('name_required')
    if (String(phone || '').replace(/\D/g, '').length < 7) fail('phone_required')
    const key = clientKey({ client_phone: phone, client_name: name })
    db().waitlist ||= []
    if (db().waitlist.some((w) => w.shop_id === shopId && w.date === date && w.status === 'waiting' && clientKey(w) === key)) return
    db().waitlist.push({ id: id(), shop_id: shopId, date, client_name: name.trim(), client_phone: phone.trim(), lang, client_chat_id: null, status: 'waiting', created_at: new Date().toISOString() })
    save()
  },

  // Owner
  async getSession() { await wait(60); return db().session },
  onAuthChange() { return () => {} },
  async signIn() { db().session = { user: { id: 'demo-owner', email: 'demo@navbat.app' }, shopId: db().shops[0].id }; save(); return db().session },
  async signUp() { return this.signIn() },
  async signOut() { db().session = null; save() },
  async getMyShop() { await wait(); return myShop() },
  async createMyShop() { return myShop() },
  async updateShop(shopId, patch) {
    await wait()
    requireOwner(shopId)
    if (patch.slug && db().shops.some((s) => s.slug === patch.slug && s.id !== shopId)) fail('slug_taken')
    Object.assign(shopById(shopId), patch)
    save()
    return shopById(shopId)
  },
  async saveService(service) {
    await wait()
    requireOwner(service.shop_id)
    const list = db().services
    const existing = service.id && list.find((s) => s.id === service.id)
    if (existing) Object.assign(existing, service)
    else list.push({ active: true, archived: false, description: '', sort: list.length + 1, ...service, id: id() })
    save()
  },
  async archiveService(shopId, serviceId) {
    await wait()
    requireOwner(shopId)
    const s = db().services.find((x) => x.id === serviceId)
    if (s) s.archived = true
    save()
  },
  async listBookings(shopId, from, to) {
    await wait()
    requireOwner(shopId)
    return db().bookings.filter((b) => b.shop_id === shopId && (!from || b.date >= from) && (!to || b.date <= to))
      .sort((a, b) => (a.date === b.date ? a.start_min - b.start_min : a.date < b.date ? -1 : 1))
  },
  async setBookingStatus(shopId, bookingId, status) {
    await wait(150)
    requireOwner(shopId)
    const b = db().bookings.find((x) => x.id === bookingId) || fail('booking_not_found')
    if (b.status === 'cancelled' && status !== 'cancelled') {
      const clash = db().bookings.some((x) => x.id !== b.id && x.shop_id === shopId && x.date === b.date && x.status !== 'cancelled'
        && x.start_min < b.start_min + b.duration_min && b.start_min < x.start_min + x.duration_min)
      if (clash) fail('slot_taken')
    }
    b.status = status
    save()
  },
  async addManualBooking(shopId, { date, startMin, durationMin, serviceIds = [], name = '', phone = '', note = '', blocked = false }) {
    await wait()
    requireOwner(shopId)
    const clash = db().bookings.some((x) => x.shop_id === shopId && x.date === date && x.status !== 'cancelled'
      && x.start_min < startMin + durationMin && startMin < x.start_min + x.duration_min)
    if (clash) fail('slot_taken')
    const picked = db().services.filter((s) => serviceIds.includes(s.id))
    db().bookings.push({
      id: id(), shop_id: shopId, token: token(), date, start_min: startMin, duration_min: durationMin,
      service_ids: picked.map((s) => s.id), service_names: picked.map((s) => s.name),
      total_price: picked.reduce((a, s) => a + Number(s.price), 0), client_name: name, client_phone: phone, note,
      status: blocked ? 'blocked' : 'booked', source: 'barber', created_at: new Date().toISOString(),
    })
    save()
  },
  async listWaitlist(shopId, from, to) {
    await wait(120)
    requireOwner(shopId)
    return (db().waitlist || []).filter((w) => w.shop_id === shopId && (!from || w.date >= from) && (!to || w.date <= to)).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  },
  async setWaitlistStatus(shopId, waitId, status) {
    await wait(120)
    requireOwner(shopId)
    const w = (db().waitlist || []).find((x) => x.id === waitId)
    if (w) w.status = status
    save()
  },
  async listClientNotes(shopId) {
    await wait(120)
    requireOwner(shopId)
    return (db().clientNotes || []).filter((c) => c.shop_id === shopId)
  },
  async saveClientNote(shopId, key, patch) {
    await wait(150)
    requireOwner(shopId)
    db().clientNotes ||= []
    const existing = db().clientNotes.find((c) => c.shop_id === shopId && c.client_key === key)
    if (existing) Object.assign(existing, patch, { updated_at: new Date().toISOString() })
    else db().clientNotes.push({ shop_id: shopId, client_key: key, note: '', blocked: false, ...patch, updated_at: new Date().toISOString() })
    save()
  },
  async telegramSignIn() { return this.signIn() },
  async linkShopTelegram(shopId) {
    await wait()
    requireOwner(shopId)
    shopById(shopId).owner_chat_id = 1
    save()
    return shopById(shopId)
  },
  async setReviewHidden(shopId, reviewId, hidden) {
    await wait(150)
    requireOwner(shopId)
    const r = db().reviews.find((x) => x.id === reviewId)
    if (r) r.hidden = hidden
    save()
  },
}
