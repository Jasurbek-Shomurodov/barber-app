// Supabase backend. Public callers only use the SECURITY DEFINER functions from
// migrations/001_init.sql; the owner reads tables directly under RLS.
import { createClient } from '@supabase/supabase-js'

const PAGE = 1000

function fail(error) {
  const known = /(client_blocked|too_late_to_cancel|slot_taken|name_required|phone_required|service_unavailable|date_out_of_range|time_passed|outside_hours|cannot_cancel|cannot_review|too_early|already_reviewed|booking_not_found|shop_not_found|not_signed_in)/.exec(error?.message || '')
  const e = new Error(known ? known[1] : error?.message || 'unknown_error')
  e.code = known ? known[1] : error?.code === '23505' ? 'slug_taken' : error?.code === '23P01' ? 'slot_taken' : 'unknown_error'
  throw e
}
const unwrap = ({ data, error }) => (error ? fail(error) : data)

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
    // Linking happens through the bot deep link; nothing to do here.
    async linkBookingTelegram() {},
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
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session))
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) { return unwrap(await sb.auth.signInWithPassword({ email, password })).session },
    async signUp(email, password) { return unwrap(await sb.auth.signUp({ email, password })).session },
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
