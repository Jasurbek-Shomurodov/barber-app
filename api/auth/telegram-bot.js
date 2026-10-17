// Barber sign-in through the bot (no Login Widget popup, no Telegram service message).
// POST { action: 'start', code, secret }  registers a login request; the browser then opens
//                                        t.me/<bot>?start=l_<code> and the bot asks to confirm.
// POST { action: 'poll', code, secret }   → { status: 'pending' | 'cancelled' }
//                                        → { token_hash } once confirmed (single use), for
//                                          supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
// The code travels through Telegram; the secret never leaves the browser that started the login,
// so only that browser can collect the session. The confirmation itself happens in api/telegram/webhook.js.
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { hashLoginSecret, isLoginCode, isLoginSecret, json, loginRequestState, loginSecretMatches, readJson } from '../_lib/telegram.js'
import { signInTelegramUser } from '../_lib/telegramUser.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  let body
  try { body = await readJson(req) } catch { return json(res, 400, { error: 'bad_json' }) }
  const { action, code, secret } = body || {}
  if (!['start', 'poll'].includes(action) || !isLoginCode(code) || !isLoginSecret(secret)) return json(res, 400, { error: 'telegram_payload_invalid' })

  try {
    const sb = supabaseAdmin()
    if (action === 'start') {
      // Old requests are useless after their window; keep the table small.
      await sb.from('telegram_login_requests').delete().lt('created_at', new Date(Date.now() - 86400_000).toISOString())
      const { data, error } = await sb.from('telegram_login_requests')
        .upsert({ code, secret_hash: hashLoginSecret(secret) }, { onConflict: 'code', ignoreDuplicates: true })
        .select('code')
      if (error) throw error
      if (!data?.length) return json(res, 409, { error: 'telegram_code_taken' })
      return json(res, 200, { status: 'pending' })
    }

    const { data: row } = await sb.from('telegram_login_requests').select('*').eq('code', code).maybeSingle()
    if (row && !loginSecretMatches(row, secret)) return json(res, 401, { error: 'telegram_signature_invalid' })
    const state = loginRequestState(row)
    if (state === 'pending' || state === 'cancelled') return json(res, 200, { status: state })
    if (state !== 'confirmed') return json(res, 410, { error: 'telegram_login_expired' })

    // Claim the confirmation exactly once, even if two polls race.
    const { data: claimed } = await sb.from('telegram_login_requests')
      .update({ status: 'used' }).eq('code', code).eq('status', 'confirmed').select('telegram_id, username, first_name, last_name')
    const tg = claimed?.[0]
    if (!tg?.telegram_id) return json(res, 410, { error: 'telegram_login_expired' })
    const { token_hash } = await signInTelegramUser(sb, {
      id: String(tg.telegram_id), username: tg.username || '', first_name: tg.first_name || '', last_name: tg.last_name || '',
    })
    return json(res, 200, { status: 'confirmed', token_hash })
  } catch (err) {
    console.error('telegram bot auth failed', err?.message)
    return json(res, 500, { error: 'auth_failed' })
  }
}
