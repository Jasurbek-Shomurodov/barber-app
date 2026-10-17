import { Phone, Send } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { useAsync } from '../../lib/useAsync.js'
import { Shimmer } from '../../components/ui.jsx'

/** People waiting for a free time on `date`; shown under the day calendar. */
export default function Waitlist({ shop, date }) {
  const { t } = useI18n()
  const q = useAsync(() => api.listWaitlist(shop.id, date, date), [shop.id, date])
  const list = (q.data || []).filter((w) => w.status !== 'cancelled')
  if (q.data && !list.length) return null
  async function remove(w) {
    await api.setWaitlistStatus(shop.id, w.id, 'cancelled')
    q.setData(q.data.map((x) => (x.id === w.id ? { ...x, status: 'cancelled' } : x)))
  }
  return (
    <section className="mt-4">
      <h3 className="c-muted mb-2 text-[13px] font-medium uppercase tracking-wide">{t('waitlist')} · {q.data ? list.length : ''}</h3>
      <div className="space-y-2">
        {!q.data ? <Shimmer className="h-12 w-full rounded-2xl" /> : list.map((w) => (
          <div key={w.id} className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[14px]">
            <div className="min-w-0 flex-1">
              <div className="c-title flex items-center gap-2 font-medium">{w.client_name}
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${w.status === 'notified' ? 'pill-ok' : w.status === 'booked' ? 'pill-ok' : 'pill-warn'}`}>{t(`waitlist_${w.status}`)}</span>
                {w.client_chat_id && <Send size={12} className="c-gold" />}
              </div>
              <a href={`tel:${w.client_phone.replace(/\s/g, '')}`} className="c-body flex items-center gap-1 text-[13px] hover:underline"><Phone size={12} />{w.client_phone}</a>
            </div>
            <button type="button" onClick={() => remove(w)} className="btn-ghost rounded-full px-3 py-1.5 text-[13px]">{t('archive')}</button>
          </div>
        ))}
      </div>
    </section>
  )
}
