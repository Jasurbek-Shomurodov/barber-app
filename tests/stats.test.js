import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize, visitsByMonth, normalizePhone } from '../src/lib/stats.js'

const b = (over) => ({ date: '2026-10-01', status: 'done', total_price: 100, service_names: ['Haircut'], client_name: 'A', client_phone: '+998 90 123 45 67', ...over })

test('phones match regardless of formatting', () => {
  assert.equal(normalizePhone('+998 (90) 123-45-67'), normalizePhone('901234567'))
})

test('summary counts unique served clients and services', () => {
  const s = summarize([
    b({}),
    b({ client_phone: '901234567', date: '2026-10-05', service_names: ['Haircut', 'Beard'], total_price: 200 }),
    b({ client_name: 'B', client_phone: '911111111' }),
    b({ client_name: 'C', client_phone: '922222222', status: 'no_show' }),
    b({ status: 'cancelled' }),
    b({ status: 'blocked', client_phone: '' }),
  ], [{ rating: 5 }, { rating: 4 }])
  assert.equal(s.clients, 2)
  assert.equal(s.repeatClients, 1)
  assert.equal(s.visits, 3)
  assert.equal(s.revenue, 400)
  assert.equal(s.noShows, 1)
  assert.equal(s.noShowRate, 0.25)
  assert.equal(s.avgRating, 4.5)
  assert.deepEqual(s.services.map((x) => [x.name, x.count]), [['Haircut', 3], ['Beard', 1]])
  assert.equal(s.topClients[0].visits, 2)
})

test('visits by month fills empty months', () => {
  const rows = visitsByMonth([b({ date: '2026-09-02' }), b({ date: '2026-10-02' }), b({ date: '2026-10-03' })], '2026-10-17', 3)
  assert.deepEqual(rows, [{ month: '2026-08', count: 0 }, { month: '2026-09', count: 1 }, { month: '2026-10', count: 2 }])
})
