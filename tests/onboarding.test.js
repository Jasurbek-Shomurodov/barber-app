import test from 'node:test'
import assert from 'node:assert/strict'
import { CHECKLIST, checklistProgress, shopChecklist } from '../src/lib/onboarding.js'

test('an empty shop has nothing ticked', () => {
  const p = checklistProgress({})
  assert.equal(p.done, 0)
  assert.equal(p.total, CHECKLIST.length)
  assert.equal(p.complete, false)
})

test('the admin list row and the barber shop row tick the same items', () => {
  const adminRow = { owner_name: 'Bek', owner_phone: '+998 90 111 22 33', phone: '', address: 'Chilonzor 5', services: 2, telegram_linked: true }
  const barberRow = { name: 'My Shop', phone: '+998 90 111 22 33', address: 'Chilonzor 5', services: 2, telegram_linked: true }
  assert.deepEqual(shopChecklist(adminRow), shopChecklist(barberRow))
  assert.equal(checklistProgress(adminRow).complete, true)
})

test('whitespace and zero counts do not count', () => {
  const items = Object.fromEntries(shopChecklist({ owner_name: ' ', phone: '1', address: '  ', services: 0, telegram_linked: false }).map((i) => [i.key, i.done]))
  assert.deepEqual(items, { owner_name: false, phone: false, address: false, services: false, telegram: false })
})
