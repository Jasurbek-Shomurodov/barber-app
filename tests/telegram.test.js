import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { verifyLoginWidget, verifyWebAppInitData, startPayload } from '../api/_lib/telegram.js'

const token = '123456:TEST_TOKEN'
const now = 1_800_000_000_000

function signWidget(data) {
  const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('\n')
  const secret = crypto.createHash('sha256').update(token).digest()
  return { ...data, hash: crypto.createHmac('sha256', secret).update(check).digest('hex') }
}

test('login widget: valid payload passes, tampered or stale fails', () => {
  const data = signWidget({ id: 42, first_name: 'Ali', username: 'ali', auth_date: Math.floor(now / 1000) - 60 })
  assert.equal(verifyLoginWidget(data, { token, now }).id, '42')
  assert.throws(() => verifyLoginWidget({ ...data, first_name: 'Eve' }, { token, now }), /signature/)
  assert.throws(() => verifyLoginWidget(data, { token: 'other', now }), /signature/)
  assert.throws(() => verifyLoginWidget(data, { token, now: now + 2 * 86400_000 }), /expired/)
  assert.throws(() => verifyLoginWidget({ id: 1 }, { token, now }), /invalid/)
})

test('web app initData is verified with the WebAppData key', () => {
  const params = new URLSearchParams({ auth_date: String(Math.floor(now / 1000)), user: JSON.stringify({ id: 7, first_name: 'B' }), query_id: 'q' })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest()
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'))
  assert.equal(verifyWebAppInitData(params.toString(), { token, now }).id, '7')
  assert.throws(() => verifyWebAppInitData(params.toString().replace('q', 'z'), { token, now }), /signature/)
})

test('start payload parsing', () => {
  assert.equal(startPayload('/start b_abc'), 'b_abc')
  assert.equal(startPayload('/start@BarberBot s_1'), 's_1')
  assert.equal(startPayload('/start'), '')
  assert.equal(startPayload('hello'), null)
})
