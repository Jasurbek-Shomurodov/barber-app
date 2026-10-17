// Turns a verified Telegram identity into an ordinary Supabase session token.
// Shared by the Login Widget route (api/auth/telegram.js) and the bot sign-in (api/auth/telegram-bot.js).
// Callers must have verified `tg` first: a widget HMAC or a confirmation inside the bot chat.

const emailFor = (id) => `tg${id}@telegram.barber.local`

/** Finds or creates the user for this Telegram id and returns { token_hash } for verifyOtp({ type: 'magiclink' }). */
export async function signInTelegramUser(sb, tg) {
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
  return { token_hash: link.properties.hashed_token }
}
