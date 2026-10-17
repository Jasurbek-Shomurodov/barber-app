// Client and service numbers for the barber's dashboard. Only finished visits ('done')
// count as served clients; no-shows and cancellations are reported separately.

export const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '').slice(-9)

export function clientKey(b) {
  return normalizePhone(b.client_phone) || `name:${String(b.client_name || '').trim().toLowerCase()}`
}

export function summarize(bookings, reviews = []) {
  const real = bookings.filter((b) => b.status !== 'blocked')
  const done = real.filter((b) => b.status === 'done')
  const clients = new Map()
  for (const b of done) {
    const key = clientKey(b)
    const c = clients.get(key) || { key, name: b.client_name, phone: b.client_phone, visits: 0, spent: 0, last: '', telegram: false }
    c.visits += 1
    if (b.client_chat_id) c.telegram = true
    c.spent += Number(b.total_price) || 0
    if (b.date >= c.last) { c.last = b.date; c.name = b.client_name || c.name }
    clients.set(key, c)
  }
  const services = new Map()
  for (const b of done) {
    const names = b.service_names?.length ? b.service_names : ['—']
    const share = (Number(b.total_price) || 0) / names.length
    for (const name of names) {
      const s = services.get(name) || { name, count: 0, revenue: 0 }
      s.count += 1
      s.revenue += share
      services.set(name, s)
    }
  }
  const ratings = reviews.map((r) => Number(r.rating)).filter(Boolean)
  const closed = done.length + real.filter((b) => b.status === 'no_show').length
  const list = [...clients.values()].sort((a, b) => b.visits - a.visits || (a.last < b.last ? 1 : -1))
  return {
    clients: clients.size,
    repeatClients: list.filter((c) => c.visits > 1).length,
    visits: done.length,
    revenue: done.reduce((s, b) => s + (Number(b.total_price) || 0), 0),
    noShows: real.filter((b) => b.status === 'no_show').length,
    noShowRate: closed ? real.filter((b) => b.status === 'no_show').length / closed : 0,
    cancelled: real.filter((b) => b.status === 'cancelled').length,
    upcoming: real.filter((b) => b.status === 'booked').length,
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
    reviewCount: ratings.length,
    services: [...services.values()].sort((a, b) => b.count - a.count),
    topClients: list,
  }
}

/** Finished visits per month for the last `months` months ending at `todayIso`. */
export function visitsByMonth(bookings, todayIso, months = 6) {
  const [y, m] = todayIso.split('-').map(Number)
  const keys = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const counts = Object.fromEntries(keys.map((k) => [k, 0]))
  for (const b of bookings) if (b.status === 'done' && b.date.slice(0, 7) in counts) counts[b.date.slice(0, 7)] += 1
  return keys.map((k) => ({ month: k, count: counts[k] }))
}

/** Finished visits by start hour (0..23), for the "busiest hours" chart. */
export function busiestHours(bookings) {
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  for (const b of bookings) if (b.status === 'done') counts[Math.floor(b.start_min / 60) % 24].count += 1
  const used = counts.filter((h) => h.count)
  if (!used.length) return counts.slice(8, 22)
  const lo = Math.max(0, Math.min(...used.map((h) => h.hour)) - 1)
  const hi = Math.min(23, Math.max(...used.map((h) => h.hour)) + 1)
  return counts.slice(lo, hi + 1)
}

/** RFC 4180 CSV; Excel-friendly with the BOM the caller prepends. */
export function toCsv(rows) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
}
