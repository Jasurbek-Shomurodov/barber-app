import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { useAsync } from '../../lib/useAsync.js'
import { addDays, nowInZone } from '../../lib/time.js'
import { summarize, visitsByMonth } from '../../lib/stats.js'
import { ErrorNote, Shimmer, Stars } from '../../components/ui.jsx'
import { PageTitle } from './AdminApp.jsx'

const PERIODS = { period_30: 30, period_90: 90, period_all: null }

export default function Clients({ shop }) {
  const { t, money, dayMonth, monthShort } = useI18n()
  const today = nowInZone(shop.timezone).date
  const [period, setPeriod] = useState('period_all')
  const [query, setQuery] = useState('')
  const q = useAsync(() => Promise.all([api.listBookings(shop.id), api.listReviews(shop.id, { all: true })]), [shop.id])

  const [bookings, reviews] = q.data || [[], []]
  const from = PERIODS[period] ? addDays(today, -PERIODS[period]) : null
  const inPeriod = useMemo(() => bookings.filter((b) => b.date <= today && (!from || b.date >= from)), [bookings, from, today])
  const s = useMemo(() => summarize(inPeriod, reviews.filter((r) => !from || r.created_at.slice(0, 10) >= from)), [inPeriod, reviews, from])
  const monthly = useMemo(() => visitsByMonth(bookings, today, 6), [bookings, today])
  const upcoming = bookings.filter((b) => b.status === 'booked' && b.date >= today).length
  const maxMonth = Math.max(1, ...monthly.map((m) => m.count))
  const maxService = Math.max(1, ...s.services.map((x) => x.count))
  const needle = query.trim().toLowerCase()
  const clients = s.topClients.filter((c) => !needle || c.name?.toLowerCase().includes(needle) || String(c.phone).replace(/\D/g, '').includes(needle.replace(/\D/g, '') || '§'))

  const tiles = [
    ['clientsTotal', s.clients],
    ['repeatClients', s.clients ? `${s.repeatClients} · ${Math.round((s.repeatClients / s.clients) * 100)}%` : 0],
    ['visits', s.visits],
    ['revenue', money(s.revenue, shop.currency)],
    ['noShowRate', `${Math.round(s.noShowRate * 100)}%`],
    ['upcoming', upcoming],
  ]

  return (
    <div className="max-w-5xl">
      <PageTitle title={t('nav_clients')}>
        <div className="soft flex rounded-full p-0.5 text-[13px] font-medium">
          {Object.keys(PERIODS).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={`rounded-full px-3.5 py-1.5 ${period === p ? 'bg-[var(--soft-strong)] c-title shadow-sm' : 'c-muted'}`}>{t(p)}</button>
          ))}
        </div>
      </PageTitle>

      {q.error ? <ErrorNote error="loadFailed" onRetry={q.reload} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {tiles.map(([label, value]) => (
              <div key={label} className="glass rounded-[22px] p-4">
                <div className="c-muted text-[12px] font-medium">{t(label)}</div>
                {q.data ? <div className="c-title mt-1 text-[24px] font-semibold leading-tight tabular-nums">{value}</div> : <Shimmer className="mt-2 h-7 w-16" />}
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="glass rounded-[24px] p-5">
              <h2 className="serif c-title text-[24px] font-semibold">{t('visitsPerMonth')}</h2>
              <div className="mt-4 flex h-40 items-end gap-3">
                {monthly.map((m) => (
                  <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    {q.data ? <>
                      <span className="c-title text-[12px] font-semibold tabular-nums">{m.count || ''}</span>
                      <div className="w-full max-w-[44px] rounded-t-xl bg-gradient-to-t from-[#A86D33] to-[#D9A466]" style={{ height: `${(m.count / maxMonth) * 100}%`, minHeight: m.count ? 4 : 0 }} />
                    </> : <Shimmer className="w-full max-w-[44px]" style={{ height: `${30 + ((m.month.charCodeAt(6) * 13) % 60)}%` }} />}
                    <span className="c-muted text-[12px] capitalize">{monthShort(m.month)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass rounded-[24px] p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="serif c-title text-[24px] font-semibold">{t('topServices')}</h2>
                {s.reviewCount > 0 && <span className="c-body flex items-center gap-1.5 text-[14px]"><Stars value={s.avgRating} size={13} />{s.avgRating.toFixed(1)}</span>}
              </div>
              <ul className="mt-3 space-y-2.5">
                {!q.data ? [0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-8 w-full" />) : s.services.map((x) => (
                  <li key={x.name}>
                    <div className="flex justify-between text-[14px]"><span className="c-title font-medium">{x.name}</span><span className="c-muted tabular-nums">{x.count} · {money(x.revenue, shop.currency)}</span></div>
                    <div className="soft mt-1 h-2 overflow-hidden rounded-full"><div className="h-full rounded-full bg-gradient-to-r from-[#A86D33] to-[#D9A466]" style={{ width: `${(x.count / maxService) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="glass mt-4 rounded-[24px] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="serif c-title text-[24px] font-semibold">{t('topClients')} <span className="c-muted text-[18px]">· {s.clients}</span></h2>
              <label className="field flex !w-full items-center gap-2 !py-2 sm:!w-64">
                <Search size={15} className="c-muted shrink-0" />
                <input className="w-full bg-transparent outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchClients')} />
              </label>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead><tr className="c-muted b-line border-b text-left text-[12px]">
                  <th className="py-2 font-medium">{t('client')}</th><th className="py-2 font-medium">{t('phone')}</th>
                  <th className="py-2 text-right font-medium">{t('visits')}</th><th className="py-2 text-right font-medium">{t('revenue')}</th><th className="py-2 text-right font-medium">{t('lastVisit')}</th>
                </tr></thead>
                <tbody>
                  {!q.data ? [0, 1, 2, 3, 4].map((i) => <tr key={i}><td colSpan={5} className="py-2"><Shimmer className="h-6 w-full" /></td></tr>)
                    : clients.slice(0, 100).map((c) => (
                      <tr key={c.key} className="b-line border-b last:border-0">
                        <td className="c-title py-2.5 font-medium">{c.name}</td>
                        <td className="py-2.5"><a href={`tel:${String(c.phone).replace(/\s/g, '')}`} className="c-body tabular-nums hover:underline">{c.phone}</a></td>
                        <td className="c-title py-2.5 text-right tabular-nums">{c.visits}</td>
                        <td className="c-body py-2.5 text-right tabular-nums">{money(c.spent, shop.currency)}</td>
                        <td className="c-muted py-2.5 text-right">{dayMonth(c.last)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
