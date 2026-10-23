// Supabase backend. Public callers only use the SECURITY DEFINER functions from
// migrations/001_init.sql; the owner reads tables directly under RLS.
import { createClient } from '@supabase/supabase-js'
import { phoneLoginEmail } from './phoneLogin.js'

const PAGE = 1000

function fail(error) {
  const known = /(client_blocked|too_late_to_cancel|slot_taken|name_required|phone_required|service_unavailable|date_out_of_range|time_passed|outside_hours|cannot_cancel|cannot_review|too_early|already_reviewed|booking_not_found|shop_not_found|not_signed_in|not_allowed|slug_taken)/.exec(error?.message || '')
  const e = new Error(known ? known[1] : error?.message || 'unknown_error')
  e.code = known ? known[1] : error?.code === '23505' ? 'slug_taken' : error?.code === '23P01' ? 'slot_taken' : 'unknown_error'
  throw e
}
const unwrap = ({ data, error }) => (error ? fail(error) : data)
const apiError = (code) => Object.assign(new Error(code), { code })

/** POST to one of our api/auth routes; throws their error code. */
async function postAuth(path, payload) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw apiError(body.error || 'auth_failed')
  return body
}

export function createSupabaseApi(url, key) {
  const sb = createClient(url, key)

  // PostgREST caps a select at 1000 rows, so long ranges are read page by page.
  async function pagedBookings(shopId, from, to) {
    const rows = []
    for (let offset = 0; ; offset += PAGE) {
      let q = sb.from('bookings').select('*').eq('shop_id', shopId).order('id').range(offset, offset + PAGE - 1)
      if (from) q = q.gte('date', from)
      if (to) q = q.lte('date', to)
      const page = unwrap(await q)
      rows.push(...page)
      if (page.length < PAGE) break
    }
    return rows.sort((a, b) => (a.date === b.date ? a.start_min - b.start_min : a.date < b.date ? -1 : 1))
  }

  return {
    mode: 'supabase',

    async getShopBySlug(slug) { return unwrap(await sb.from('shops').select('*').eq('slug', slug).maybeSingle()) },
    async listServices(shopId, { all = false } = {}) {
      let q = sb.from('services').select('*').eq('shop_id', shopId).eq('archived', false).order('sort').order('name')
      if (!all) q = q.eq('active', true)
      return unwrap(await q)
    },
    async getBusy(shopId, from, to) { return unwrap(await sb.rpc('get_busy', { p_shop: shopId, p_from: from, p_to: to })) },
    async createBooking({ shopId, serviceIds, date, startMin, name, phone, note, lang = 'ru', telegram = null }) {
      return unwrap(await sb.rpc('create_booking', {
        p_shop: shopId, p_service_ids: serviceIds, p_date: date, p_start_min: startMin, p_name: name, p_phone: phone, p_note: note || '',
        p_lang: lang, p_telegram: telegram,
      }))
    },
    async joinWaitlist({ shopId, date, name, phone, lang = 'ru' }) {
      unwrap(await sb.rpc('join_waitlist', { p_shop: shopId, p_date: date, p_name: name, p_phone: phone, p_lang: lang }))
    },
    async getBooking(token) { return unwrap(await sb.rpc('get_booking', { p_token: token })) },
    async cancelBooking(token) { unwrap(await sb.rpc('cancel_booking', { p_token: token })) },
    async submitReview(token, { rating, comment }) { unwrap(await sb.rpc('submit_review', { p_token: token, p_rating: rating, p_comment: comment || '' })) },
    async listReviews(shopId, { all = false } = {}) {
      let q = sb.from('reviews').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(PAGE)
      if (!all) q = q.eq('hidden', false)
      return unwrap(await q)
    },
    async getPublicStats(shopId) { return unwrap(await sb.rpc('get_public_stats', { p_shop: shopId })) },

    async getSession() { return unwrap(await sb.auth.getSession()).session },
    /** Name and phone the account was created with, to prefill the booking form. */
    async getProfile() {
      const user = unwrap(await sb.auth.getSession()).session?.user
      if (!user) return null
      const meta = user.user_metadata || {}
      return { name: meta.full_name || meta.name || '', phone: meta.phone || '' }
    },
    async isPlatformAdmin() { return Boolean(unwrap(await sb.rpc('is_platform_admin'))) },
    async adminListShops() { return unwrap(await sb.rpc('admin_list_shops')) },
    async adminSetShopStatus(shopId, status) { unwrap(await sb.rpc('admin_set_shop_status', { p_shop: shopId, p_status: status })) },
    /** One shop for /owner/:id: settings, services, upcoming bookings as times only, and the log. */
    async adminShopOverview(shopId) { return unwrap(await sb.rpc('admin_shop_overview', { p_shop: shopId })) },
    async adminAddNote(shopId, note) { return unwrap(await sb.rpc('admin_add_note', { p_shop: shopId, p_note: note })) },
    /** The signed-in client's own bookings across shops (no phones; tokens open /b/:token). */
    async myBookings() { return unwrap(await sb.rpc('my_bookings')) },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session))
      return () => data.subscription.unsubscribe()
    },
    /** Phone + password: the phone maps to its internal auth address (src/lib/phoneLogin.js). */
    async signInWithPhone(phone, password) {
      const email = phoneLoginEmail(phone)
      if (!email) throw apiError('phone_invalid')
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw apiError(/invalid/i.test(error.message) ? 'invalid_login' : 'auth_failed')
      return data.session
    },
    async signUpWithPhone(name, phone, password) {
      await postAuth('/api/auth/phone-signup', { name, phone, password })
      return this.signInWithPhone(phone, password)
    },
    /** Bot sign-in, step 1: register the code the deep link carries. */
    async startTelegramBotLogin(code, secret) { await postAuth('/api/auth/telegram-bot', { action: 'start', code, secret }) },
    /** Bot sign-in, step 2: null while waiting for the confirm button, then the session. */
    async pollTelegramBotLogin(code, secret) {
      const body = await postAuth('/api/auth/telegram-bot', { action: 'poll', code, secret })
      if (body.status === 'cancelled') throw apiError('telegram_login_cancelled')
      if (!body.token_hash) return null
      return unwrap(await sb.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' })).session
    },
    /** Telegram Login Widget payload → verified by api/auth/telegram.js → Supabase session. */
    async telegramSignIn(widgetUser) {
      const res = await fetch('/api/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(widgetUser) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { const e = new Error(body.error || 'auth_failed'); e.code = body.error || 'auth_failed'; throw e }
      return unwrap(await sb.auth.verifyOtp({ token_hash: body.token_hash, type: 'magiclink' })).session
    },
    async linkShopTelegram(shopId) { return unwrap(await sb.from('shops').select('*').eq('id', shopId).single()) },
    async signOut() { await sb.auth.signOut() },
    async getMyShop() {
      const user = unwrap(await sb.auth.getUser()).user
      if (!user) return null
      return unwrap(await sb.from('shops').select('*').eq('owner_id', user.id).maybeSingle())
    },
    async createMyShop(slug, name) { return unwrap(await sb.rpc('create_my_shop', { p_slug: slug, p_name: name })) },
    async updateShop(shopId, patch) { return unwrap(await sb.from('shops').update(patch).eq('id', shopId).select().single()) },
    async saveService(service) {
      const { id, ...row } = service
      unwrap(id ? await sb.from('services').update(row).eq('id', id) : await sb.from('services').insert(row))
    },
    async archiveService(shopId, serviceId) { unwrap(await sb.from('services').update({ archived: true }).eq('id', serviceId).eq('shop_id', shopId)) },
    listBookings: pagedBookings,
    async setBookingStatus(shopId, bookingId, status) { unwrap(await sb.from('bookings').update({ status }).eq('id', bookingId).eq('shop_id', shopId)) },
    async addManualBooking(shopId, { date, startMin, durationMin, serviceIds = [], name = '', phone = '', note = '', blocked = false }) {
      const services = serviceIds.length ? unwrap(await sb.from('services').select('id,name,price').in('id', serviceIds)) : []
      unwrap(await sb.from('bookings').insert({
        shop_id: shopId, date, start_min: startMin, duration_min: durationMin,
        service_ids: services.map((s) => s.id), service_names: services.map((s) => s.name),
        total_price: services.reduce((a, s) => a + Number(s.price), 0),
        client_name: name, client_phone: phone, note, status: blocked ? 'blocked' : 'booked', source: 'barber',
      }))
    },
    async listWaitlist(shopId, from, to) {
      let q = sb.from('waitlist').select('*').eq('shop_id', shopId).order('created_at').limit(PAGE)
      if (from) q = q.gte('date', from)
      if (to) q = q.lte('date', to)
      return unwrap(await q)
    },
    async setWaitlistStatus(shopId, waitId, status) { unwrap(await sb.from('waitlist').update({ status }).eq('id', waitId).eq('shop_id', shopId)) },
    async listClientNotes(shopId) { return unwrap(await sb.from('client_notes').select('*').eq('shop_id', shopId).limit(PAGE)) },
    async saveClientNote(shopId, key, patch) {
      unwrap(await sb.from('client_notes').upsert({ shop_id: shopId, client_key: key, ...patch, updated_at: new Date().toISOString() }))
    },
    async setReviewHidden(shopId, reviewId, hidden) { unwrap(await sb.from('reviews').update({ hidden }).eq('id', reviewId).eq('shop_id', shopId)) },
  }
}
