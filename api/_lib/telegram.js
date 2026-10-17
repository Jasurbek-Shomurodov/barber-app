// Telegram helpers shared by the API routes. Secrets come from env only; nothing here is
// imported by the browser bundle (Vite only bundles src/).
import crypto from 'node:crypto'

const LOGIN_MAX_AGE_SECONDS = 60 * 60 * 24

export function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN')
  return token
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex')
  const right = Buffer.from(String(b || ''), 'hex')
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right)
}

/**
 * Verifies a Telegram Login Widget payload ({ id, first_name, username, photo_url, auth_date, hash }).
 * Returns the user fields or throws. Key = SHA256(bot token); data-check-string = sorted key=value lines.
 */
export function verifyLoginWidget(data, { token = getBotToken(), now = Date.now() } = {}) {
  if (!data || typeof data !== 'object' || !data.hash || !data.id) throw new Error('telegram_payload_invalid')
  const checkString = Object.keys(data)
    .filter((k) => k !== 'hash' && data[k] !== undefined && data[k] !== null)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n')
  const secret = crypto.createHash('sha256').update(token).digest()
  const calc = crypto.createHmac('sha256', secret).update(checkString).digest('hex')
  if (!timingSafeEqualHex(calc, data.hash)) throw new Error('telegram_signature_invalid')
  const authDate = Number(data.auth_date)
  if (!Number.isFinite(authDate) || Math.floor(now / 1000) - authDate > LOGIN_MAX_AGE_SECONDS) throw new Error('telegram_login_expired')
  return {
    id: String(data.id),
    username: data.username || '',
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    photo_url: data.photo_url || '',
  }
}

/** Verifies Mini App initData (query string). Key = HMAC_SHA256("WebAppData", token). */
export function verifyWebAppInitData(initData, { token = getBotToken(), now = Date.now() } = {}) {
  const params = new URLSearchParams(String(initData || ''))
  const hash = params.get('hash')
  if (!hash) throw new Error('telegram_payload_invalid')
  params.delete('hash')
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest()
  const calc = crypto.createHmac('sha256', secret).update(checkString).digest('hex')
  if (!timingSafeEqualHex(calc, hash)) throw new Error('telegram_signature_invalid')
  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || Math.floor(now / 1000) - authDate > LOGIN_MAX_AGE_SECONDS) throw new Error('telegram_login_expired')
  const user = JSON.parse(params.get('user') || 'null')
  if (!user?.id) throw new Error('telegram_payload_invalid')
  return { id: String(user.id), username: user.username || '', first_name: user.first_name || '', last_name: user.last_name || '' }
}

export async function callTelegram(method, payload, token = getBotToken()) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) {
    const err = new Error(json.description || `telegram_${res.status}`)
    err.retryable = res.status === 429 || res.status >= 500
    throw err
  }
  return json.result
}

export const sendMessage = (chatId, text, extra = {}) =>
  callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra })

// Bot sign-in (api/auth/telegram-bot.js + webhook): the browser's code goes in the deep link,
// its secret stays in the browser and only sha256(secret) is stored.
export const BOT_LOGIN_TTL_MS = 10 * 60 * 1000
export const isLoginCode = (code) => typeof code === 'string' && /^[A-Za-z0-9_-]{20,40}$/.test(code)
export const isLoginSecret = (secret) => typeof secret === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(secret)
export const hashLoginSecret = (secret) => crypto.createHash('sha256').update(String(secret)).digest('hex')

/** What a login request means right now: 'pending' | 'confirmed' | 'expired' | 'used' | 'cancelled'. */
export function loginRequestState(row, now = Date.now()) {
  if (!row) return 'expired'
  if (row.status === 'used' || row.status === 'cancelled') return row.status
  // A confirmation gets its own window, so confirming in the last minute still signs in.
  if (now - new Date(row.confirmed_at || row.created_at).getTime() > BOT_LOGIN_TTL_MS) return 'expired'
  return row.status === 'confirmed' ? 'confirmed' : 'pending'
}

/** True when `secret` is the one registered for this request (constant time). */
export const loginSecretMatches = (row, secret) => Boolean(row) && isLoginSecret(secret) && timingSafeEqualHex(row.secret_hash, hashLoginSecret(secret))

/** The `/start <payload>` deep-link argument, or ''. */
export function startPayload(text) {
  const m = /^\/start(?:@\w+)?(?:\s+(\S+))?/.exec(String(text || '').trim())
  return m ? m[1] || '' : null
}

export function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}
