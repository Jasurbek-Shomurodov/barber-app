// Dates are plain 'YYYY-MM-DD' strings and times are minutes from midnight, both in the
// shop's own timezone. Nothing here depends on the browser's timezone.

export const pad = (n) => String(n).padStart(2, '0')

export function minToLabel(min) {
  const m = ((min % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function labelToMin(label) {
  const [h, m] = String(label || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function formatIso(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDays(iso, days) {
  const d = parseDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return formatIso(d)
}

/** 0 = Sunday … 6 = Saturday */
export const weekday = (iso) => parseDate(iso).getUTCDay()

/** Monday of the week containing `iso`. */
export function startOfWeek(iso) {
  return addDays(iso, -((weekday(iso) + 6) % 7))
}

export function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000)
}

/** Current date and minute in a timezone, e.g. 'Asia/Tashkent'. */
export function nowInZone(timeZone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) }
}

export function formatDuration(min, t) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} ${t('min')}`
  return m ? `${h} ${t('h')} ${m} ${t('min')}` : `${h} ${t('h')}`
}
