import test from 'node:test'
import assert from 'node:assert/strict'
import { availableStarts, canBook, totalDuration } from '../src/lib/slots.js'
import { addDays, startOfWeek, weekday, minToLabel, labelToMin } from '../src/lib/time.js'

const hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: 600, close: 720, off: day === 0 }))
const MONDAY = '2026-10-19'

test('date helpers', () => {
  assert.equal(weekday(MONDAY), 1)
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(startOfWeek('2026-10-25'), MONDAY)
  assert.equal(minToLabel(labelToMin('09:05')), '09:05')
})

test('slots fit inside working hours', () => {
  const starts = availableStarts({ date: MONDAY, hours, duration: 60, step: 30 })
  assert.deepEqual(starts.map(minToLabel), ['10:00', '10:30', '11:00'])
})

test('day off has no slots', () => {
  assert.deepEqual(availableStarts({ date: '2026-10-18', hours, duration: 30 }), [])
})

test('busy bookings block overlapping slots but cancelled ones do not', () => {
  const busy = [
    { start_min: 630, duration_min: 30, status: 'booked' },
    { start_min: 690, duration_min: 30, status: 'cancelled' },
  ]
  const starts = availableStarts({ date: MONDAY, hours, duration: 30, step: 30, busy })
  assert.deepEqual(starts.map(minToLabel), ['10:00', '11:00', '11:30'])
})

test('today skips past times plus lead window, past days are closed', () => {
  const now = { date: MONDAY, minute: 610 }
  const starts = availableStarts({ date: MONDAY, hours, duration: 30, step: 15, now, leadMin: 30 })
  assert.equal(minToLabel(starts[0]), '10:45')
  assert.deepEqual(availableStarts({ date: '2026-10-17', hours, duration: 30, now }), [])
})

test('canBook checks exact minute and duration sums services', () => {
  assert.equal(totalDuration([{ duration_min: 30 }, { duration_min: 20 }]), 50)
  assert.ok(canBook({ date: MONDAY, hours, duration: 50, start: 610 }))
  assert.ok(!canBook({ date: MONDAY, hours, duration: 50, start: 680 }))
})

test('buffer keeps a gap around busy bookings and closed dates have no slots', () => {
  const busy = [{ start_min: 660, duration_min: 30, status: 'booked' }]
  const starts = availableStarts({ date: MONDAY, hours, duration: 30, step: 15, busy, bufferMin: 15 })
  assert.deepEqual(starts.map(minToLabel), ['10:00', '10:15'])
  assert.deepEqual(availableStarts({ date: MONDAY, hours, duration: 30, closedDates: [MONDAY] }), [])
})
