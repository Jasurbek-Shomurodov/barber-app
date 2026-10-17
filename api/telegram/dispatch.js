// Flushes the notification queue from Vercel when the database cannot send itself (no pg_net).
// Protected by CRON_SECRET (Vercel sets Authorization: Bearer <CRON_SECRET> on cron calls).
//   GET /api/telegram/dispatch
import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { json, sendMessage } from '../_lib/telegram.js'

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return json(res, 401, { error: 'unauthorized' })
  const sb = supabaseAdmin()
  const { data: rows, error } = await sb.rpc('claim_notifications', { p_limit: 50 })
  if (error) return json(res, 500, { error: error.message })
  let sent = 0
  let failed = 0
  for (const n of rows || []) {
    try {
      const result = await sendMessage(n.chat_id, n.text)
      await sb.rpc('finish_notification', { p_id: n.id, p_ok: true, p_request: result?.message_id ?? null })
      sent++
    } catch (err) {
      // A blocked bot or a deleted chat never succeeds: stop retrying those.
      const permanent = /blocked|deactivated|chat not found|not enough rights/i.test(err.message)
      await sb.rpc('finish_notification', { p_id: n.id, p_ok: false, p_error: err.message })
      if (permanent) await sb.from('notifications').update({ status: 'failed' }).eq('id', n.id)
      failed++
    }
  }
  return json(res, 200, { claimed: rows?.length || 0, sent, failed })
}
