// Bot webhook. Register once:
//   curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://barber.vercel.app/api/telegram/webhook&secret_token=$TELEGRAM_WEBHOOK_SECRET"
// Handles deep links:
//   /start b_<booking token>   client links this chat to a booking (confirmations + reminders)
//   /start s_<shop link code>  barber links this chat to their shop (new bookings, cancellations, daily summary)
//   /start                     greeting
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { json, readJson, sendMessage, startPayload } from '../_lib/telegram.js'

const T = {
  ru: {
    hello: '👋 Это бот записи Barber. Откройте ссылку своей записи или страницу барбера и нажмите «Получать напоминания в Telegram».',
    linkedBooking: (shop) => `✅ Готово! Напомним о визите в <b>${shop}</b> и сообщим об изменениях.`,
    linkedShop: (shop) => `✅ Этот чат привязан к <b>${shop}</b>. Сюда будут приходить новые записи, отмены и утренняя сводка.`,
    notFound: 'Ссылка устарела или запись не найдена.',
  },
  uz: {
    hello: "👋 Bu Barber yozilish boti. Yozuv havolangizni yoki sartarosh sahifasini ochib, «Telegramda eslatma olish» tugmasini bosing.",
    linkedBooking: (shop) => `✅ Tayyor! <b>${shop}</b> ga tashrifingiz haqida eslatamiz va o'zgarishlarni xabar qilamiz.`,
    linkedShop: (shop) => `✅ Bu chat <b>${shop}</b> ga ulandi. Yangi yozuvlar, bekor qilishlar va ertalabki xulosa shu yerga keladi.`,
    notFound: 'Havola eskirgan yoki yozuv topilmadi.',
  },
  en: {
    hello: '👋 This is the Barber booking bot. Open your booking link or the barber page and tap “Get reminders in Telegram”.',
    linkedBooking: (shop) => `✅ Done! We will remind you about your visit to <b>${shop}</b> and tell you about changes.`,
    linkedShop: (shop) => `✅ This chat is linked to <b>${shop}</b>. New bookings, cancellations and the morning summary arrive here.`,
    notFound: 'This link has expired or the booking was not found.',
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
  const msg = update?.message
  const chatId = msg?.chat?.id
  if (!chatId || msg.chat.type !== 'private') return json(res, 200, { ok: true })

  const payload = startPayload(msg.text)
  const lang = langOf(msg.from?.language_code)
  const t = T[lang]
  try {
    if (payload === null) return json(res, 200, { ok: true }) // not a /start: ignore quietly
    const sb = supabaseAdmin()
    if (payload.startsWith('b_')) {
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
