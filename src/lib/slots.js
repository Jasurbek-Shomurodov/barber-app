import { weekday } from './time.js'

export const DEFAULT_HOURS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  open: 10 * 60,
  close: 20 * 60,
  off: day === 0,
}))

export function hoursFor(hours, iso) {
  const day = weekday(iso)
  return (hours || DEFAULT_HOURS).find((h) => h.day === day) || { day, open: 0, close: 0, off: true }
}

/** A day is closed when it is the weekly day off or in the shop's closed dates (holidays). */
export function isClosed(shop, iso) {
  return hoursFor(shop.hours, iso).off || (shop.closed_dates || []).includes(iso)
}

export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd

/** Bookings that occupy the chair. Cancelled ones free their time again. */
export const isBlocking = (b) => b.status !== 'cancelled'

export function totalDuration(services) {
  return services.reduce((sum, s) => sum + (Number(s.duration_min) || 0), 0)
}

/**
 * Start times (minutes) when a visit of `duration` fits on `date`.
 * busy:        [{ start_min, duration_min, status? }] on that date.
 * now:         { date, minute } in the shop timezone; past times and the lead window are skipped.
 * bufferMin:   gap the barber wants between two visits (cleanup, a smoke).
 * closedDates: extra closed days (holidays).
 */
export function availableStarts({ date, hours, duration, busy = [], step = 15, now, leadMin = 30, bufferMin = 0, closedDates = [] }) {
  const day = hoursFor(hours, date)
  if (day.off || closedDates.includes(date) || !duration || duration <= 0) return []
  if (now && date < now.date) return []
  const earliest = now && date === now.date ? now.minute + leadMin : -Infinity
  const taken = busy.filter(isBlocking)
  const out = []
  for (let start = day.open; start + duration <= day.close; start += step) {
    if (start < earliest) continue
    const end = start + duration
    if (taken.some((b) => overlaps(start, end, b.start_min - bufferMin, b.start_min + b.duration_min + bufferMin))) continue
    out.push(start)
  }
  return out
}

/** Server-side style check used before saving a booking (mirrors the SQL RPC). */
export function canBook(args) {
  return availableStarts({ ...args, step: 1 }).includes(args.start)
}

/** Everything availableStarts needs from a shop row. */
export function slotOptionsFor(shop) {
  return { hours: shop.hours, step: shop.slot_step, leadMin: shop.lead_min, bufferMin: shop.buffer_min || 0, closedDates: shop.closed_dates || [] }
}
