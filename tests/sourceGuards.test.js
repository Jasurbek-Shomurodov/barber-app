import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Guards for the rules in AGENTS.md. Each one protects a real boundary; do not weaken to pass.
const root = new URL('..', import.meta.url).pathname
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const srcFiles = walk('src').filter((f) => /\.(jsx?|css)$/.test(f))

test('no secrets or service-role access in the browser bundle', () => {
  for (const f of srcFiles) {
    const s = read(f)
    assert.ok(!/SERVICE_ROLE|TELEGRAM_BOT_TOKEN|api\.telegram\.org\/bot/.test(s), `${f} touches a server secret`)
  }
})

test('no blocking native dialogs in operational flows', () => {
  for (const f of srcFiles) {
    assert.ok(!/\b(alert|confirm|prompt)\(/.test(read(f).replace(/\/\/.*$/gm, '')), `${f} uses a native dialog`)
  }
})

test('loading states are shimmers, never spinners or loading text', () => {
  for (const f of srcFiles.filter((f) => f.endsWith('.jsx'))) {
    const s = read(f)
    assert.ok(!/animate-spin|Loading\.\.\.|Загрузка\.\.\./.test(s), `${f} shows a spinner or loading text`)
  }
})

test('public RPCs never return client phones', () => {
  const sql = fs.readdirSync(path.join(root, 'migrations')).map((f) => read(path.join('migrations', f))).join('\n')
  const getBooking = sql.slice(sql.lastIndexOf('create or replace function get_booking'), sql.lastIndexOf('create or replace function get_booking') + 1500)
  assert.ok(!/client_phone/.test(getBooking), 'get_booking exposes client_phone')
  const getBusy = sql.slice(sql.indexOf('create or replace function get_busy'), sql.indexOf('create or replace function get_busy') + 600)
  assert.ok(!/client_name|client_phone/.test(getBusy), 'get_busy exposes client data')
})

test('every migration is append-only: files are numbered and not renamed', () => {
  const files = fs.readdirSync(path.join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
  files.forEach((f, i) => assert.match(f, new RegExp(`^${String(i + 1).padStart(3, '0')}_`), `${f} breaks the numbering`))
})

test('api routes authenticate before using service credentials', () => {
  const webhook = read('api/telegram/webhook.js')
  assert.ok(webhook.indexOf('x-telegram-bot-api-secret-token') < webhook.indexOf('supabaseAdmin()'), 'webhook uses the admin client before checking the secret')
  const dispatch = read('api/telegram/dispatch.js')
  assert.ok(dispatch.indexOf('CRON_SECRET') < dispatch.indexOf('supabaseAdmin()'))
  const auth = read('api/auth/telegram.js')
  assert.ok(auth.indexOf('verifyLoginWidget(') < auth.indexOf('supabaseAdmin()'))
  const bot = read('api/auth/telegram-bot.js')
  assert.ok(bot.indexOf('isLoginSecret(') < bot.indexOf('supabaseAdmin()'), 'bot login touches the admin client before validating its input')
  assert.ok(/loginSecretMatches\(row, secret\)/.test(bot), 'bot login hands out sessions without checking the browser secret')
  assert.ok(/\.eq\('status', 'confirmed'\)/.test(bot), 'a bot confirmation must be claimed once')
})

test('telegram login requests are service-role only', () => {
  const sql = read('migrations/004_telegram_bot_login.sql')
  assert.match(sql, /telegram_login_requests enable row level security/)
  assert.ok(!/create policy[^;]*telegram_login_requests/i.test(sql), 'login requests must not be readable by clients')
})
