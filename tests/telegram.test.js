import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { verifyLoginWidget, verifyWebAppInitData, startPayload, BOT_LOGIN_TTL_MS, hashLoginSecret, isLoginCode, loginRequestState, loginSecretMatches } from '../api/_lib/telegram.js'
import { loginPhoneDigits, phoneLoginEmail } from '../src/lib/phoneLogin.js'

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

test('bot login: only the browser holding the secret collects, and only within the window', () => {
  const secret = 'S'.repeat(43)
  const created = new Date(now - 60_000).toISOString()
  const row = { code: 'c'.repeat(24), secret_hash: hashLoginSecret(secret), status: 'pending', created_at: created }
  assert.ok(isLoginCode(row.code))
  assert.ok(!isLoginCode('short'), 'codes are long and random')
  assert.ok(!isLoginCode('a'.repeat(24) + ' x'), 'codes are deep-link safe')
  assert.ok(loginSecretMatches(row, secret))
  assert.ok(!loginSecretMatches(row, 'T'.repeat(43)))
  assert.equal(loginRequestState(row, now), 'pending')
  assert.equal(loginRequestState({ ...row, status: 'confirmed', confirmed_at: created }, now), 'confirmed')
  assert.equal(loginRequestState(row, now + BOT_LOGIN_TTL_MS), 'expired')
  // Confirming late in the window still gives the browser time to collect.
  const lateConfirm = new Date(now + BOT_LOGIN_TTL_MS - 1000).toISOString()
  assert.equal(loginRequestState({ ...row, status: 'confirmed', confirmed_at: lateConfirm }, now + BOT_LOGIN_TTL_MS + 5000), 'confirmed')
  assert.equal(loginRequestState({ ...row, status: 'used' }, now), 'used')
  assert.equal(loginRequestState(null, now), 'expired')
})

test('phone login maps every way of typing a number to one account', () => {
  const email = phoneLoginEmail('+998 90 123 45 67')
  assert.equal(email, 'p998901234567@phone.barber.local')
  assert.equal(phoneLoginEmail('90 123-45-67'), email)
  assert.equal(phoneLoginEmail('998901234567'), email)
  assert.equal(loginPhoneDigits('12345'), '')
  assert.equal(phoneLoginEmail(''), '')
})
