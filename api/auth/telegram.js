// Barber sign-in with the Telegram Login Widget.
// POST { id, first_name, username, photo_url, auth_date, hash } (the widget's callback data)
//   → verifies the signature with the bot token
//   → finds or creates the Supabase user for this Telegram id
//   → returns { token_hash } for supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
// The client ends up with an ordinary Supabase session; RLS stays unchanged.
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { json, readJson, verifyLoginWidget } from '../_lib/telegram.js'

const emailFor = (id) => `tg${id}@telegram.barber.local`

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  let tg
  try {
    tg = verifyLoginWidget(await readJson(req))
  } catch (err) {
    return json(res, 401, { error: err.message })
  }
  try {
    const sb = supabaseAdmin()
    const email = emailFor(tg.id)
    const { data: existing } = await sb.from('telegram_accounts').select('user_id').eq('telegram_id', tg.id).maybeSingle()
    let userId = existing?.user_id
    if (!userId) {
      const { data: created, error } = await sb.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { telegram_id: tg.id, telegram_username: tg.username, full_name: [tg.first_name, tg.last_name].filter(Boolean).join(' ') },
      })
      if (error && !/already/i.test(error.message)) throw error
      if (created?.user) userId = created.user.id
      else {
        const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
        userId = list?.users?.find((u) => u.email === email)?.id
      }
      if (!userId) throw new Error('user_not_created')
      await sb.from('telegram_accounts').upsert({ telegram_id: tg.id, user_id: userId, username: tg.username, first_name: tg.first_name })
    } else {
      await sb.from('telegram_accounts').update({ username: tg.username, first_name: tg.first_name }).eq('telegram_id', tg.id)
    }
    // A barber who signs in with Telegram can be messaged in that same private chat.
    await sb.from('shops').update({ owner_chat_id: Number(tg.id) }).eq('owner_id', userId).is('owner_chat_id', null)

    const { data: link, error: linkErr } = await sb.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkErr) throw linkErr
    return json(res, 200, { token_hash: link.properties.hashed_token, telegram: { id: tg.id, username: tg.username, first_name: tg.first_name } })
  } catch (err) {
    console.error('telegram auth failed', err?.message)
    return json(res, 500, { error: 'auth_failed' })
  }
}
