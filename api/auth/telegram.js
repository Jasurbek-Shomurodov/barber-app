// Sign-in with the Telegram Login Widget (the client booking page still uses it).
// POST { id, first_name, username, photo_url, auth_date, hash } (the widget's callback data)
//   → verifies the signature with the bot token
//   → finds or creates the Supabase user for this Telegram id
//   → returns { token_hash } for supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
// The client ends up with an ordinary Supabase session; RLS stays unchanged.
// The barber login page uses the bot flow instead (api/auth/telegram-bot.js).
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { json, readJson, verifyLoginWidget } from '../_lib/telegram.js'
import { signInTelegramUser } from '../_lib/telegramUser.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  let tg
  try {
    tg = verifyLoginWidget(await readJson(req))
  } catch (err) {
    return json(res, 401, { error: err.message })
  }
  try {
    const { token_hash } = await signInTelegramUser(supabaseAdmin(), tg)
    return json(res, 200, { token_hash, telegram: { id: tg.id, username: tg.username, first_name: tg.first_name } })
  } catch (err) {
    console.error('telegram auth failed', err?.message)
    return json(res, 500, { error: 'auth_failed' })
  }
}
