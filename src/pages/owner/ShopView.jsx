import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Eye } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { useAsync } from '../../lib/useAsync.js'
import { minToLabel } from '../../lib/time.js'
import AccountShell from '../../components/AccountShell.jsx'
import { Checklist } from '../../components/Checklist.jsx'
import { ErrorNote, Shimmer, StatusPill } from '../../components/ui.jsx'
import { OwnerContacts, OwnerShimmer, STATUS_PILL, StatusActions } from './shared.jsx'

/** /owner/:shopId — what the barber sees, read-only, plus the admin's notes and the log.
 *  Bookings are shown as times only; the RPC never returns client names or phones. */
export default function ShopView() {
  const { shopId } = useParams()
  const { t } = useI18n()
  const q = useAsync(() => api.adminShopOverview(shopId), [shopId])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const back = <Link to="/owner" className="btn-ghost flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"><ArrowLeft size={14} />{t('ownerBack')}</Link>

  if (q.error && !q.data) return <AccountShell wide links={back}><ErrorNote error={q.error} onRetry={q.reload} /></AccountShell>
  if (!q.data) return <AccountShell wide links={back}><OwnerShimmer /></AccountShell>
  const { shop: s, services, upcoming, events } = q.data
  const checklistShop = { ...s, services: services.length }

  const setStatus = async (shop, status) => {
    await api.adminSetShopStatus(shop.id, status)
    q.reload()
  }

  return (
    <AccountShell wide links={back}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="serif c-title text-[36px] font-semibold leading-none">{s.name}</h1>
            <span className={`${STATUS_PILL[s.status]} rounded-full px-2.5 py-0.5 text-[12px] font-semibold`}>{t(`shopStatus_${s.status}`)}</span>
          </div>
          <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="c-gold mt-1 inline-flex items-center gap-1 text-[14px] hover:underline">/{s.slug}<ExternalLink size={13} /></a>
        </div>
        <StatusActions shop={s} onStatus={setStatus} busy={busy} setBusy={setBusy} setError={setError} />
      </div>
      {error && <div className="mb-4"><ErrorNote error={error} /></div>}
      <p className="c-muted mb-4 flex items-center gap-2 text-[13px]"><Eye size={14} />{t('ownerReadOnly')}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="glass rounded-[24px] p-5">
            <OwnerContacts shop={s} />
            {s.address && <p className="c-body mt-2 text-[14px]">{s.address}</p>}
            {s.tagline && <p className="c-muted mt-1 text-[14px]">{s.tagline}</p>}
          </section>

          <section className="glass rounded-[24px] p-5">
            <h2 className="c-title mb-3 text-[15px] font-semibold">{t('nav_settings')}</h2>
            <HoursTable hours={s.hours} />
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
              <Rule label={t('slotStep')} value={`${s.slot_step} ${t('min')}`} />
              <Rule label={t('leadTime')} value={`${s.lead_min} ${t('minAhead')}`} />
              <Rule label={t('bookingWindow')} value={`${s.booking_days} ${t('days')}`} />
              <Rule label={t('bufferTime')} value={`${s.buffer_min} ${t('min')}`} />
              <Rule label={t('cancelHours')} value={`${s.cancel_hours} ${t('hoursBefore')}`} />
              <Rule label={t('closedDates')} value={s.closed_dates.length ? s.closed_dates.join(', ') : '—'} />
            </dl>
          </section>

          <section className="glass rounded-[24px] p-5">
            <h2 className="c-title mb-3 text-[15px] font-semibold">{t('nav_services')} <span className="c-muted font-normal tabular-nums">{services.length}</span></h2>
            {!services.length ? <p className="c-muted text-[14px]">{t('ownerNoServices')}</p> : (
              <ul className="divide-y divide-[var(--line)] text-[14px]">
                {services.map((v) => (
                  <li key={v.id} className={`flex items-center justify-between gap-3 py-2 ${v.active ? '' : 'opacity-50'}`}>
                    <span className="min-w-0 truncate"><span className="c-title">{v.name}</span>{v.category && <span className="c-muted"> · {v.category}</span>}</span>
                    <span className="c-body shrink-0 tabular-nums">{v.duration_min} {t('min')} · <Money value={v.price} currency={s.currency} /></span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass rounded-[24px] p-5">
            <h2 className="c-title mb-3 text-[15px] font-semibold">{t('ownerUpcomingDays')} <span className="c-muted font-normal tabular-nums">{upcoming.length}</span></h2>
            {!upcoming.length ? <p className="c-muted text-[14px]">{t('ownerUpcomingEmpty')}</p> : <UpcomingList items={upcoming} currency={s.currency} />}
          </section>
        </div>

        <div className="space-y-4">
          <section className="glass rounded-[24px] p-5"><Checklist shop={checklistShop} /></section>
          <Log shopId={s.id} events={events} onAdded={q.reload} />
        </div>
      </div>
    </AccountShell>
  )
}

function Rule({ label, value }) {
  return <div><dt className="c-muted">{label}</dt><dd className="c-title font-medium tabular-nums">{value}</dd></div>
}

function Money({ value, currency }) {
  const { money } = useI18n()
  return money(value, currency)
}

function HoursTable({ hours }) {
  const { t, weekdayName } = useI18n()
  const days = [1, 2, 3, 4, 5, 6, 0].map((d) => hours.find((h) => h.day === d) || { day: d, off: true })
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
      {days.map((h) => (
        <li key={h.day} className="flex justify-between gap-2"><span className="c-muted capitalize">{weekdayName(h.day)}</span>
          <span className={`tabular-nums ${h.off ? 'c-muted' : 'c-title'}`}>{h.off ? t('dayOffShort') : `${minToLabel(h.open)}–${minToLabel(h.close)}`}</span></li>
      ))}
    </ul>
  )
}

function UpcomingList({ items, currency }) {
  const { dayLong, money } = useI18n()
  const byDate = items.reduce((acc, b) => ((acc[b.date] ||= []).push(b), acc), {})
  return (
    <div className="space-y-3">
      {Object.entries(byDate).map(([date, list]) => (
        <div key={date}>
          <div className="c-muted mb-1 text-[12px] font-medium uppercase tracking-wide">{dayLong(date)}</div>
          <ul className="divide-y divide-[var(--line)] text-[14px]">
            {list.map((b, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                <span className="c-title shrink-0 tabular-nums">{minToLabel(b.start_min)}–{minToLabel(b.start_min + b.duration_min)}</span>
                <span className="c-body min-w-0 flex-1 truncate">{b.status === 'blocked' ? '' : b.service_names.join(', ')}</span>
                <span className="c-muted shrink-0 tabular-nums">{b.status === 'blocked' ? <StatusPill status="blocked" /> : money(b.total_price, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** The admin's notes and every status change, newest first. */
function Log({ shopId, events, onAdded }) {
  const { t, tf, dateTime } = useI18n()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function submit(e) {
    e.preventDefault()
    if (!note.trim()) return
    setBusy(true); setError(null)
    try { await api.adminAddNote(shopId, note); setNote(''); onAdded() } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <section className="glass rounded-[24px] p-5">
      <h2 className="c-title mb-3 text-[15px] font-semibold">{t('ownerLog')}</h2>
      <form onSubmit={submit} className="mb-3 space-y-2">
        <textarea className="field min-h-[72px] w-full resize-y" value={note} maxLength={1000} placeholder={t('ownerNotePlaceholder')} onChange={(e) => setNote(e.target.value)} />
        {error && <ErrorNote error={error} />}
        <button type="submit" disabled={busy || !note.trim()} className="btn-primary rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-50">{t('addNote')}</button>
      </form>
      <ol className="space-y-2.5 text-[14px]">
        {events.map((e) => (
          <li key={e.id} className="flex gap-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.kind === 'note' ? 'bg-[var(--gold)]' : e.to_status === 'approved' ? 'bg-[var(--ok)]' : e.to_status === 'suspended' ? 'bg-[var(--bad)]' : 'bg-[var(--line)]'}`} />
            <div className="min-w-0">
              <div className={e.kind === 'note' ? 'c-title whitespace-pre-wrap' : 'c-body'}>
                {e.kind === 'note' ? e.note : e.kind === 'created' ? t('event_created') : tf('event_status', { to: t(`shopStatus_${e.to_status}`) })}
              </div>
              <div className="c-muted text-[12px]">{dateTime(e.created_at)}{e.by_admin ? ` · ${t('byYou')}` : ''}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
