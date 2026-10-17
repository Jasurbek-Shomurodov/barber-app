// Bot webhook. Register once:
//   curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://barberuz.vercel.app/api/telegram/webhook&secret_token=$TELEGRAM_WEBHOOK_SECRET"
// Handles deep links:
//   /start b_<booking token>   client links this chat to a booking (confirmations + reminders)
//   /start s_<shop link code>  barber links this chat to their shop (new bookings, cancellations, daily summary)
//   /start l_<login code>      barber signs in to the website: the bot asks to confirm, the button
//                              (callback lc:/lx:<code>) marks the request in telegram_login_requests
//   /start                     greeting
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { callTelegram, isLoginCode, json, loginRequestState, readJson, sendMessage, startPayload } from '../_lib/telegram.js'

const T = {
  ru: {
    hello: '👋 Это бот записи Barber. Откройте ссылку своей записи или страницу барбера и нажмите «Получать напоминания в Telegram».',
    linkedBooking: (shop) => `✅ Готово! Напомним о визите в <b>${shop}</b> и сообщим об изменениях.`,
    linkedShop: (shop) => `✅ Этот чат привязан к <b>${shop}</b>. Сюда будут приходить новые записи, отмены и утренняя сводка.`,
    notFound: 'Ссылка устарела или запись не найдена.',
    loginAsk: '🔐 Войти в Barber на сайте barberuz.vercel.app?\nНажимайте, только если вход начали вы сами.',
    loginYes: '✅ Подтвердить вход',
    loginNo: 'Отмена',
    loginDone: '✅ Вход подтверждён. Вернитесь в браузер.',
    loginCancelled: 'Вход отменён.',
    loginExpired: 'Ссылка для входа устарела. Нажмите «Войти через Telegram» на сайте ещё раз.',
  },
  uz: {
    hello: "👋 Bu Barber yozilish boti. Yozuv havolangizni yoki sartarosh sahifasini ochib, «Telegramda eslatma olish» tugmasini bosing.",
    linkedBooking: (shop) => `✅ Tayyor! <b>${shop}</b> ga tashrifingiz haqida eslatamiz va o'zgarishlarni xabar qilamiz.`,
    linkedShop: (shop) => `✅ Bu chat <b>${shop}</b> ga ulandi. Yangi yozuvlar, bekor qilishlar va ertalabki xulosa shu yerga keladi.`,
    notFound: 'Havola eskirgan yoki yozuv topilmadi.',
    loginAsk: "🔐 barberuz.vercel.app saytida Barber ga kirasizmi?\nFaqat kirishni o'zingiz boshlagan bo'lsangiz bosing.",
    loginYes: "✅ Kirishni tasdiqlash",
    loginNo: "Bekor qilish",
    loginDone: "✅ Kirish tasdiqlandi. Brauzerga qayting.",
    loginCancelled: "Kirish bekor qilindi.",
    loginExpired: "Kirish havolasi eskirgan. Saytda «Telegram orqali kirish» tugmasini qayta bosing.",
  },
  en: {
    hello: '👋 This is the Barber booking bot. Open your booking link or the barber page and tap “Get reminders in Telegram”.',
    linkedBooking: (shop) => `✅ Done! We will remind you about your visit to <b>${shop}</b> and tell you about changes.`,
    linkedShop: (shop) => `✅ This chat is linked to <b>${shop}</b>. New bookings, cancellations and the morning summary arrive here.`,
    notFound: 'This link has expired or the booking was not found.',
    loginAsk: '🔐 Sign in to Barber on barberuz.vercel.app?\nOnly tap if you started this sign-in yourself.',
    loginYes: '✅ Confirm sign-in',
    loginNo: 'Cancel',
    loginDone: '✅ Sign-in confirmed. Go back to your browser.',
    loginCancelled: 'Sign-in cancelled.',
    loginExpired: 'This sign-in link has expired. Tap “Sign in with Telegram” on the site again.',
  },
}
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const langOf = (code) => (['ru', 'uz', 'en'].includes(code) ? code : 'ru')

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return json(res, 401, { error: 'unauthorized' })

  let update
  try { update = await readJson(req) } catch { return json(res, 400, { error: 'bad_json' }) }
  if (update?.callback_query) {
    try { await onLoginButton(update.callback_query) } catch (err) { console.error('webhook callback failed', err?.message) }
    return json(res, 200, { ok: true })
  }
  const msg = update?.message
  const chatId = msg?.chat?.id
  if (!chatId || msg.chat.type !== 'private') return json(res, 200, { ok: true })

  const payload = startPayload(msg.text)
  const lang = langOf(msg.from?.language_code)
  const t = T[lang]
  try {
    if (payload === null) return json(res, 200, { ok: true }) // not a /start: ignore quietly
    const sb = supabaseAdmin()
    if (payload.startsWith('l_')) {
      await askLoginConfirm(sb, chatId, payload.slice(2), t)
    } else if (payload.startsWith('b_')) {
      const token = payload.slice(2)
      const { data: b } = await sb.from('bookings').select('id, client_name, client_phone, lang, shops(name)').eq('token', token).maybeSingle()
      if (!b) { await sendMessage(chatId, t.notFound); return json(res, 200, { ok: true }) }
      await sb.from('bookings').update({ client_chat_id: chatId }).eq('id', b.id)
      const { data: key } = await sb.rpc('client_key', { p_phone: b.client_phone, p_name: b.client_name })
      if (key) await sb.from('telegram_clients').upsert({ phone_key: key, chat_id: chatId, name: b.client_name, updated_at: new Date().toISOString() })
      await sendMessage(chatId, T[langOf(b.lang)].linkedBooking(esc(b.shops?.name)))
    } else if (payload.startsWith('s_')) {
      const { data: shop } = await sb.from('shops').update({ owner_chat_id: chatId }).eq('telegram_link_code', payload.slice(2)).select('name').maybeSingle()
      await sendMessage(chatId, shop ? t.linkedShop(esc(shop.name)) : t.notFound)
    } else {
      await sendMessage(chatId, t.hello)
    }
  } catch (err) {
    console.error('webhook failed', err?.message)
  }
  return json(res, 200, { ok: true })
}

const loadLogin = async (sb, code) =>
  isLoginCode(code) ? (await sb.from('telegram_login_requests').select('*').eq('code', code).maybeSingle()).data : null

/** /start l_<code>: ask the user to confirm. The browser registers the code as it opens the link, so allow it a moment. */
async function askLoginConfirm(sb, chatId, code, t) {
  let row = await loadLogin(sb, code)
  if (!row && isLoginCode(code)) {
    await new Promise((r) => setTimeout(r, 1500))
    row = await loadLogin(sb, code)
  }
  if (loginRequestState(row) !== 'pending') { await sendMessage(chatId, t.loginExpired); return }
  await sendMessage(chatId, t.loginAsk, {
    reply_markup: { inline_keyboard: [[{ text: t.loginYes, callback_data: `lc:${code}` }], [{ text: t.loginNo, callback_data: `lx:${code}` }]] },
  })
}

/** The Confirm / Cancel buttons. Only a private chat's own user can press them, so `from` is the account signing in. */
async function onLoginButton(cb) {
  const m = /^(lc|lx):(.+)$/.exec(cb.data || '')
  if (!m || cb.message?.chat?.type !== 'private') return callTelegram('answerCallbackQuery', { callback_query_id: cb.id })
  const t = T[langOf(cb.from?.language_code)]
  const [, kind, code] = m
  const sb = supabaseAdmin()
  const row = await loadLogin(sb, code)
  let text = t.loginExpired
  if (loginRequestState(row) === 'pending') {
    const patch = kind === 'lc'
      ? { status: 'confirmed', confirmed_at: new Date().toISOString(), telegram_id: cb.from.id, username: cb.from.username || null, first_name: cb.from.first_name || null, last_name: cb.from.last_name || null }
      : { status: 'cancelled' }
    const { data } = await sb.from('telegram_login_requests').update(patch).eq('code', code).eq('status', 'pending').select('code')
    if (data?.length) text = kind === 'lc' ? t.loginDone : t.loginCancelled
  }
  await callTelegram('answerCallbackQuery', { callback_query_id: cb.id })
  await callTelegram('editMessageText', { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text })
}
