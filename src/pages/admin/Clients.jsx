import { useMemo, useState } from 'react'
import { Ban, Download, Phone, Search, Send } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { useAsync } from '../../lib/useAsync.js'
import { addDays, minToLabel, nowInZone } from '../../lib/time.js'
import { busiestHours, clientKey, summarize, toCsv, visitsByMonth } from '../../lib/stats.js'
import { ErrorNote, Sheet, Shimmer, Stars, StatusPill } from '../../components/ui.jsx'
import { PageTitle } from './AdminApp.jsx'

const PERIODS = { period_30: 30, period_90: 90, period_all: null }

export default function Clients({ shop }) {
  const { t, money, dayMonth, monthShort } = useI18n()
  const today = nowInZone(shop.timezone).date
  const [period, setPeriod] = useState('period_all')
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const q = useAsync(() => Promise.all([api.listBookings(shop.id), api.listReviews(shop.id, { all: true }), api.listClientNotes(shop.id)]), [shop.id])

  const [bookings, reviews, notes] = q.data || [[], [], []]
  const noteByKey = useMemo(() => new Map(notes.map((n) => [n.client_key, n])), [notes])
  const from = PERIODS[period] ? addDays(today, -PERIODS[period]) : null
  const inPeriod = useMemo(() => bookings.filter((b) => b.date <= today && (!from || b.date >= from)), [bookings, from, today])
  const s = useMemo(() => summarize(inPeriod, reviews.filter((r) => !from || r.created_at.slice(0, 10) >= from)), [inPeriod, reviews, from])
  const monthly = useMemo(() => visitsByMonth(bookings, today, 6), [bookings, today])
  const hours = useMemo(() => busiestHours(inPeriod), [inPeriod])
  const upcoming = bookings.filter((b) => b.status === 'booked' && b.date >= today).length
  const maxMonth = Math.max(1, ...monthly.map((m) => m.count))
  const maxService = Math.max(1, ...s.services.map((x) => x.count))
  const maxHour = Math.max(1, ...hours.map((h) => h.count))
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

  function exportCsv() {
    const csv = toCsv(s.topClients.map((c) => ({ name: c.name, phone: c.phone, visits: c.visits, spent: c.spent, last_visit: c.last, note: noteByKey.get(c.key)?.note || '' })))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    a.download = `${shop.slug}-clients.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const openClient = openKey ? s.topClients.find((c) => c.key === openKey) : null

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

          <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
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
              <h2 className="serif c-title text-[24px] font-semibold">{t('busiestHours')}</h2>
              <div className="mt-4 flex h-40 items-end gap-1">
                {hours.map((h) => (
                  <div key={h.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${minToLabel(h.hour * 60)} · ${h.count}`}>
                    {q.data ? <div className="w-full rounded-t-md bg-gradient-to-t from-[#A86D33] to-[#D9A466]" style={{ height: `${(h.count / maxHour) * 100}%`, minHeight: h.count ? 3 : 0 }} /> : <Shimmer className="w-full" style={{ height: `${20 + ((h.hour * 37) % 60)}%` }} />}
                    <span className="c-muted text-[10px] tabular-nums">{h.hour % 2 === 0 ? h.hour : ''}</span>
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
              <div className="flex flex-wrap items-center gap-2">
                <label className="field flex !w-full items-center gap-2 !py-2 sm:!w-64">
                  <Search size={15} className="c-muted shrink-0" />
                  <input className="w-full bg-transparent outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchClients')} />
                </label>
                <button type="button" onClick={exportCsv} disabled={!q.data} className="btn-ghost flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium"><Download size={15} />{t('exportCsv')}</button>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead><tr className="c-muted b-line border-b text-left text-[12px]">
                  <th className="py-2 font-medium">{t('client')}</th><th className="py-2 font-medium">{t('phone')}</th>
                  <th className="py-2 text-right font-medium">{t('visits')}</th><th className="py-2 text-right font-medium">{t('revenue')}</th><th className="py-2 text-right font-medium">{t('lastVisit')}</th>
                </tr></thead>
                <tbody>
                  {!q.data ? [0, 1, 2, 3, 4].map((i) => <tr key={i}><td colSpan={5} className="py-2"><Shimmer className="h-6 w-full" /></td></tr>)
                    : clients.slice(0, 100).map((c) => {
                      const n = noteByKey.get(c.key)
                      return (
                        <tr key={c.key} onClick={() => setOpenKey(c.key)} className="b-line cursor-pointer border-b last:border-0 hover:bg-[var(--soft)]">
                          <td className="c-title py-2.5 font-medium">
                            <span className="flex items-center gap-2">{c.name}{n?.blocked && <Ban size={13} className="c-bad" />}{c.telegram && <Send size={12} className="c-gold" />}</span>
                            {n?.note && <span className="c-muted block truncate text-[12px] font-normal">{n.note}</span>}
                          </td>
                          <td className="py-2.5"><a href={`tel:${String(c.phone).replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()} className="c-body tabular-nums hover:underline">{c.phone}</a></td>
                          <td className="c-title py-2.5 text-right tabular-nums">{c.visits}</td>
                          <td className="c-body py-2.5 text-right tabular-nums">{money(c.spent, shop.currency)}</td>
                          <td className="c-muted py-2.5 text-right">{dayMonth(c.last)}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {openClient && (
        <ClientSheet shop={shop} client={openClient} note={noteByKey.get(openClient.key)} bookings={bookings.filter((b) => clientKey(b) === openClient.key)}
          onClose={() => setOpenKey(null)}
          onSaved={(patch) => {
            const next = notes.some((n) => n.client_key === openClient.key)
              ? notes.map((n) => (n.client_key === openClient.key ? { ...n, ...patch } : n))
              : [...notes, { shop_id: shop.id, client_key: openClient.key, note: '', blocked: false, ...patch }]
            q.setData([bookings, reviews, next])
          }} />
      )}
    </div>
  )
}

function ClientSheet({ shop, client, note, bookings, onClose, onSaved }) {
  const { t, money, dayMonth } = useI18n()
  const [text, setText] = useState(note?.note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const blocked = !!note?.blocked
  const history = [...bookings].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.start_min - a.start_min))

  async function persist(patch) {
    setBusy(true); setError(null)
    try { await api.saveClientNote(shop.id, client.key, patch); onSaved(patch) } catch (err) { setError(err) } finally { setBusy(false) }
  }

  return (
    <Sheet open onClose={onClose} title={client.name} wide>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <a href={`tel:${String(client.phone).replace(/\s/g, '')}`} className="c-gold flex items-center gap-2 text-[15px] font-medium hover:underline"><Phone size={15} />{client.phone}</a>
          <div className="soft grid grid-cols-3 gap-2 rounded-2xl p-3 text-center">
            <div><div className="c-title text-[20px] font-semibold tabular-nums">{client.visits}</div><div className="c-muted text-[11px]">{t('visits')}</div></div>
            <div><div className="c-title truncate text-[20px] font-semibold tabular-nums">{money(client.spent, shop.currency)}</div><div className="c-muted text-[11px]">{t('revenue')}</div></div>
            <div><div className="c-title text-[20px] font-semibold">{dayMonth(client.last)}</div><div className="c-muted text-[11px]">{t('lastVisit')}</div></div>
          </div>
          <label className="block">
            <span className="c-muted mb-1.5 block text-[13px] font-medium">{t('clientNote')}</span>
            <textarea className="field" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('clientNoteHint')} maxLength={1000} onBlur={() => text !== (note?.note || '') && persist({ note: text })} />
          </label>
          {blocked && <p className="pill-bad rounded-xl px-3 py-2 text-[13px] font-medium">{t('blockedTag')}</p>}
          {error && <ErrorNote error={error} />}
          <button type="button" disabled={busy} onClick={() => persist({ blocked: !blocked })} className={`btn-ghost flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[14px] font-medium ${blocked ? '' : 'btn-danger'}`}>
            <Ban size={15} />{blocked ? t('unblockClient') : t('blockClient')}
          </button>
        </div>
        <div>
          <h3 className="c-muted mb-2 text-[13px] font-medium uppercase tracking-wide">{t('history')} · {history.length}</h3>
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
            {history.map((b) => (
              <li key={b.id} className="soft flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[13px]">
                <div className="min-w-0">
                  <div className="c-title tabular-nums">{dayMonth(b.date)} · {minToLabel(b.start_min)}</div>
                  <div className="c-muted truncate">{b.service_names.join(', ')}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1"><StatusPill status={b.status} /><span className="c-body tabular-nums">{money(b.total_price, shop.currency)}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  )
}
