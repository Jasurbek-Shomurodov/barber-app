// Barber account by name + phone + password (no email, no SMS).
// POST { name, phone, password } → creates a confirmed Supabase user keyed by the phone's internal
// address (src/lib/phoneLogin.js); the browser then signs in with signInWithPassword.
// Done server-side so the account is confirmed at once even when email confirmation is on.
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { json, readJson } from '../_lib/telegram.js'
import { loginPhoneDigits, phoneLoginEmail, PASSWORD_MIN } from '../../src/lib/phoneLogin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  let body
  try { body = await readJson(req) } catch { return json(res, 400, { error: 'bad_json' }) }
  const name = String(body?.name || '').trim().slice(0, 80)
  const phone = loginPhoneDigits(body?.phone)
  const password = String(body?.password || '')
  if (!name) return json(res, 400, { error: 'name_required' })
  if (!phone) return json(res, 400, { error: 'phone_invalid' })
  if (password.length < PASSWORD_MIN || password.length > 72) return json(res, 400, { error: 'password_too_short' })

  try {
    const { error } = await supabaseAdmin().auth.admin.createUser({
      email: phoneLoginEmail(phone),
      password,
      email_confirm: true,
      user_metadata: { full_name: name, phone: `+${phone}` },
    })
    if (error) {
      if (/already|registered|exists/i.test(error.message)) return json(res, 409, { error: 'phone_taken' })
      throw error
    }
    return json(res, 200, { ok: true })
  } catch (err) {
    console.error('phone signup failed', err?.message)
    return json(res, 500, { error: 'auth_failed' })
  }
}
