import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock, Phone, Plus } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { useAsync } from '../../lib/useAsync.js'
import { addDays, formatDuration, labelToMin, minToLabel, nowInZone, startOfWeek } from '../../lib/time.js'
import { hoursFor, isBlocking, overlaps } from '../../lib/slots.js'
import { ErrorNote, Field, Sheet, Shimmer, StatusPill } from '../../components/ui.jsx'
import Waitlist from './Waitlist.jsx'
import { PageTitle } from './AdminApp.jsx'

const PX = 1.3 // pixels per minute

export default function CalendarView({ shop }) {
  const { t, dayLong, dayMonth, weekdayShort } = useI18n()
  const now = nowInZone(shop.timezone)
  const [view, setView] = useState(() => (window.innerWidth < 768 ? 'day' : 'week'))
  const [anchor, setAnchor] = useState(now.date)
  const [open, setOpen] = useState(null) // booking being viewed
  const [draft, setDraft] = useState(null) // { date, start, blocked }

  const days = view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
  const from = days[0]
  const to = days[days.length - 1]
  const q = useAsync(() => api.listBookings(shop.id, from, to).then((rows) => ({ key: `${from}|${to}`, rows })), [shop.id, from, to])
  const rows = q.data?.key === `${from}|${to}` ? q.data.rows : null

  // Quiet refresh so new online bookings appear without a reload.
  useEffect(() => {
    const id = setInterval(() => q.reload(), 60000)
    return () => clearInterval(id)
  }, [q.reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const [minStart, maxEnd] = useMemo(() => {
    const open = shop.hours.filter((h) => !h.off)
    let lo = open.length ? Math.min(...open.map((h) => h.open)) : 9 * 60
    let hi = open.length ? Math.max(...open.map((h) => h.close)) : 21 * 60
    for (const b of rows || []) {
      if (b.status === 'cancelled') continue
      lo = Math.min(lo, b.start_min)
      hi = Math.max(hi, b.start_min + b.duration_min)
    }
    return [Math.floor(lo / 60) * 60, Math.min(1440, Math.ceil(hi / 60) * 60)]
  }, [shop.hours, rows])

  const step = (dir) => setAnchor(addDays(anchor, dir * (view === 'day' ? 1 : 7)))
  const title = view === 'day' ? dayLong(anchor) : `${dayMonth(from)} – ${dayMonth(to)}`
  const live = (rows || []).filter(isBlocking)
  const cancelled = (rows || []).filter((b) => b.status === 'cancelled')

  async function setStatus(b, status) {
    await api.setBookingStatus(shop.id, b.id, status)
    setOpen({ ...b, status })
    q.reload()
  }

  return (
    <div>
      <PageTitle title={t('nav_calendar')}>
        <button type="button" onClick={() => setDraft({ date: anchor, start: null, blocked: true })} className="btn-ghost flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium">
          <Lock size={15} />{t('blockTime')}
        </button>
        <button type="button" onClick={() => setDraft({ date: anchor, start: null, blocked: false })} className="btn-primary flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold">
          <Plus size={16} />{t('newBooking')}
        </button>
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} className="btn-ghost grid h-9 w-9 place-items-center rounded-full" aria-label="Previous"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => step(1)} className="btn-ghost grid h-9 w-9 place-items-center rounded-full" aria-label="Next"><ChevronRight size={18} /></button>
        </div>
        <button type="button" onClick={() => setAnchor(now.date)} className="btn-ghost rounded-full px-4 py-2 text-[14px] font-medium">{t('today')}</button>
        <span className="c-title text-[16px] font-semibold capitalize">{title}</span>
        <div className="soft ml-auto flex rounded-full p-0.5 text-[14px] font-medium">
          {['day', 'week'].map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 ${view === v ? 'bg-[var(--soft-strong)] c-title shadow-sm' : 'c-muted'}`}>{t(v)}</button>
          ))}
        </div>
      </div>

      {q.error && !rows ? <ErrorNote error="loadFailed" onRetry={q.reload} /> : (
        <div className="glass overflow-hidden rounded-[24px]">
          <div className="no-scrollbar overflow-x-auto">
            <div style={{ minWidth: view === 'week' ? 760 : 0 }}>
              {/* Day headers */}
              <div className="b-line grid border-b" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
                <div />
                {days.map((d) => {
                  const count = live.filter((b) => b.date === d && b.status !== 'blocked').length
                  const isToday = d === now.date
                  return (
                    <button key={d} type="button" onClick={() => { setAnchor(d); setView('day') }} className="flex flex-col items-center gap-0.5 py-2.5 text-center">
                      <span className="c-muted text-[11px] uppercase tracking-wide">{weekdayShort(d)}</span>
                      <span className={`grid h-8 w-8 place-items-center rounded-full text-[16px] font-semibold tabular-nums ${isToday ? 'bg-gradient-to-br from-[#C08447] to-[#7C4F22] text-white' : 'c-title'}`}>{Number(d.slice(8))}</span>
                      <span className="c-muted text-[11px]">{rows ? (count ? `${count} ${t('bookingsCount')}` : '·') : ' '}</span>
                    </button>
                  )
                })}
              </div>
              {/* Grid */}
              <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: (maxEnd - minStart) * PX }}>
                <div className="relative">
                  {Array.from({ length: (maxEnd - minStart) / 60 }, (_, i) => (
                    <div key={i} className="c-muted absolute right-2 -translate-y-1/2 text-[11px] tabular-nums" style={{ top: i * 60 * PX }}>{i ? minToLabel(minStart + i * 60) : ''}</div>
                  ))}
                </div>
                {days.map((d) => (
                  <DayColumn key={d} date={d} shop={shop} rows={rows} minStart={minStart} maxEnd={maxEnd} now={now} compact={view === 'week'}
                    onOpen={setOpen} onEmpty={(start) => setDraft({ date: d, start, blocked: false })} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'day' && <Waitlist shop={shop} date={anchor} />}

      {view === 'day' && rows && cancelled.length > 0 && (
        <div className="mt-4">
          <h3 className="c-muted mb-2 text-[13px] font-medium uppercase tracking-wide">{t('status_cancelled')} · {cancelled.length}</h3>
          <div className="space-y-2">
            {cancelled.map((b) => (
              <button key={b.id} type="button" onClick={() => setOpen(b)} className="soft flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-[14px] opacity-75">
                <span className="c-title tabular-nums">{minToLabel(b.start_min)} · {b.client_name}</span>
                <span className="c-muted truncate">{b.service_names.join(', ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <BookingSheet booking={open} shop={shop} onClose={() => setOpen(null)} onStatus={setStatus} />
      {draft && <NewBookingSheet shop={shop} draft={draft} rows={rows || []} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); q.reload() }} />}
    </div>
  )
}

function DayColumn({ date, shop, rows, minStart, maxEnd, now, compact, onOpen, onEmpty }) {
  const { t } = useI18n()
  const hours = { ...hoursFor(shop.hours, date), off: hoursFor(shop.hours, date).off || (shop.closed_dates || []).includes(date) }
  const items = (rows || []).filter((b) => b.date === date && isBlocking(b))
  const top = (m) => (m - minStart) * PX
  const clickEmpty = (e) => {
    if (e.target !== e.currentTarget) return
    const y = e.nativeEvent.offsetY
    const m = Math.floor((y / PX + minStart) / shop.slot_step) * shop.slot_step
    onEmpty(m)
  }
  return (
    <div className="b-line relative cursor-copy border-l" onClick={clickEmpty}>
      {/* Hour lines */}
      {Array.from({ length: (maxEnd - minStart) / 60 }, (_, i) => (
        <div key={i} className="pointer-events-none absolute inset-x-0" style={{ top: i * 60 * PX }}>
          <div className={i ? 'cal-hour' : ''} />
          <div className="cal-half" style={{ marginTop: 30 * PX - (i ? 1 : 0) }} />
        </div>
      ))}
      {/* Closed time */}
      {hours.off ? (
        <div className="bg-page-2 pointer-events-none absolute inset-0 opacity-60" />
      ) : (
        <>
          {hours.open > minStart && <div className="bg-page-2 pointer-events-none absolute inset-x-0 top-0 opacity-60" style={{ height: top(hours.open) }} />}
          {hours.close < maxEnd && <div className="bg-page-2 pointer-events-none absolute inset-x-0 bottom-0 opacity-60" style={{ top: top(hours.close) }} />}
        </>
      )}
      {/* Now line */}
      {date === now.date && now.minute >= minStart && now.minute <= maxEnd && (
        <div className="cal-now pointer-events-none absolute inset-x-0 z-10" style={{ top: top(now.minute) }}>
          <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-[var(--bad)]" />
        </div>
      )}
      {!rows ? (
        [0, 1, 2].map((i) => <Shimmer key={i} className="absolute inset-x-1.5" style={{ top: top(minStart + 60 + i * 150), height: 50 * PX }} />)
      ) : items.map((b) => {
        const h = b.duration_min * PX
        return (
          <button key={b.id} type="button" onClick={() => onOpen(b)}
            className={`cal-block-${b.status} absolute inset-x-1 z-[5] overflow-hidden rounded-xl px-2 py-1 text-left transition hover:brightness-[1.03] hover:shadow-md`}
            style={{ top: top(b.start_min) + 1, height: h - 2 }}>
            <div className="c-title flex items-center gap-1 text-[12px] font-semibold tabular-nums leading-tight">
              {b.status === 'blocked' && <Lock size={11} />}{minToLabel(b.start_min)}{!compact && `–${minToLabel(b.start_min + b.duration_min)}`}
              {!compact && b.status !== 'booked' && b.status !== 'blocked' && <span className="ml-auto"><StatusPill status={b.status} /></span>}
            </div>
            {h > 28 && <div className="c-title truncate text-[13px] font-medium leading-tight">{b.status === 'blocked' ? (b.note || t('blocked')) : b.client_name}</div>}
            {h > 46 && b.status !== 'blocked' && <div className="c-muted truncate text-[12px] leading-tight">{b.service_names.join(', ')}</div>}
          </button>
        )
      })}
    </div>
  )
}

function BookingSheet({ booking: b, shop, onClose, onStatus }) {
  const { t, money, dayLong } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => { setError(null) }, [b?.id])
  if (!b) return null
  const act = async (status) => {
    setBusy(true); setError(null)
    try { await onStatus(b, status) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  const blocked = b.status === 'blocked'
  return (
    <Sheet open={!!b} onClose={onClose} title={blocked ? t('blocked') : b.client_name || '—'}>
      <div className="space-y-3">
        <div className="flex items-center gap-2"><StatusPill status={b.status} />{b.source === 'barber' && !blocked && <span className="pill-muted rounded-full px-2.5 py-0.5 text-[12px]">{t('sourceBarber')}</span>}</div>
        <dl className="soft space-y-2 rounded-2xl p-4 text-[15px]">
          <div className="flex justify-between gap-3"><dt className="c-muted">{t('stepTime')}</dt><dd className="c-title text-right capitalize">{dayLong(b.date)}, {minToLabel(b.start_min)}–{minToLabel(b.start_min + b.duration_min)}</dd></div>
          {!blocked && <div className="flex justify-between gap-3"><dt className="c-muted">{t('services')}</dt><dd className="c-title text-right">{b.service_names.join(', ') || '—'}</dd></div>}
          <div className="flex justify-between gap-3"><dt className="c-muted">{t('duration')}</dt><dd className="c-title">{formatDuration(b.duration_min, t)}</dd></div>
          {!blocked && <div className="flex justify-between gap-3"><dt className="c-muted">{t('total')}</dt><dd className="c-title font-semibold">{money(b.total_price, shop.currency)}</dd></div>}
          {b.client_phone && (
            <div className="flex justify-between gap-3"><dt className="c-muted">{t('phone')}</dt>
              <dd><a className="c-gold flex items-center gap-1.5 font-medium hover:underline" href={`tel:${b.client_phone.replace(/\s/g, '')}`}><Phone size={14} />{b.client_phone}</a></dd></div>
          )}
        </dl>
        {b.note && <p className="soft c-body whitespace-pre-wrap rounded-2xl p-4 text-[14px]">{b.note}</p>}
        {error && <ErrorNote error={error} />}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {b.status === 'booked' && <>
            <button type="button" disabled={busy} onClick={() => act('done')} className="btn-primary rounded-full py-3 text-[15px] font-semibold">{t('markDone')}</button>
            <button type="button" disabled={busy} onClick={() => act('no_show')} className="btn-ghost rounded-full py-3 text-[15px] font-medium">{t('markNoShow')}</button>
            <button type="button" disabled={busy} onClick={() => act('cancelled')} className="btn-ghost btn-danger col-span-2 rounded-full py-3 text-[15px] font-medium">{t('cancelVisit')}</button>
          </>}
          {blocked && <button type="button" disabled={busy} onClick={() => act('cancelled')} className="btn-ghost btn-danger col-span-2 rounded-full py-3 text-[15px] font-medium">{t('archive')}</button>}
          {['done', 'no_show', 'cancelled'].includes(b.status) && (
            <button type="button" disabled={busy} onClick={() => act('booked')} className="btn-ghost col-span-2 rounded-full py-3 text-[15px] font-medium">{t('restore')}</button>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function NewBookingSheet({ shop, draft, rows, onClose, onSaved }) {
  const { t, money } = useI18n()
  const servicesQ = useAsync(() => api.listServices(shop.id, { all: true }), [shop.id])
  const [blocked, setBlocked] = useState(draft.blocked)
  const [date, setDate] = useState(draft.date)
  const hours = hoursFor(shop.hours, date)
  const [start, setStart] = useState(minToLabel(draft.start ?? (hours.off ? 600 : hours.open)))
  const [picked, setPicked] = useState([])
  const [customDuration, setCustomDuration] = useState(60)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const services = servicesQ.data || []
  const chosen = services.filter((s) => picked.includes(s.id))
  const duration = blocked ? Number(customDuration) : chosen.reduce((a, s) => a + s.duration_min, 0)
  const startMin = labelToMin(start)
  const clash = rows.some((b) => b.date === date && isBlocking(b) && overlaps(startMin, startMin + duration, b.start_min, b.start_min + b.duration_min))

  async function save(e) {
    e.preventDefault()
    if (!duration) { setError('noServicesPicked'); return }
    setBusy(true); setError(null)
    try {
      await api.addManualBooking(shop.id, { date, startMin, durationMin: duration, serviceIds: blocked ? [] : picked, name: blocked ? '' : name, phone: blocked ? '' : phone, note, blocked })
      onSaved()
    } catch (err) { setError(err); setBusy(false) }
  }

  return (
    <Sheet open onClose={onClose} title={blocked ? t('blockTime') : t('newBooking')}>
      <form onSubmit={save} className="space-y-3">
        <div className="soft flex rounded-full p-0.5 text-[14px] font-medium">
          {[false, true].map((v) => (
            <button key={String(v)} type="button" onClick={() => setBlocked(v)}
              className={`flex-1 rounded-full py-2 ${blocked === v ? 'bg-[var(--soft-strong)] c-title shadow-sm' : 'c-muted'}`}>{v ? t('blockTime') : t('newBooking')}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('chooseDate')}><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label={t('startTime')}><input type="time" className="field" step={shop.slot_step * 60} value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        </div>
        {blocked ? (
          <>
            <Field label={`${t('duration')}, ${t('min')}`}>
              <input type="number" min={5} max={720} step={5} className="field" value={customDuration} onChange={(e) => setCustomDuration(e.target.value)} />
            </Field>
            <Field label={t('reason')}><textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('reasonPlaceholder')} /></Field>
          </>
        ) : (
          <>
            <div>
              <span className="c-muted mb-1.5 block text-[13px] font-medium">{t('services')}</span>
              <div className="flex flex-wrap gap-2">
                {!servicesQ.data ? [0, 1, 2].map((i) => <Shimmer key={i} className="h-9 w-28 rounded-full" />)
                  : services.map((s) => (
                    <button key={s.id} type="button" aria-pressed={picked.includes(s.id)} onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                      className="chip rounded-full px-3.5 py-2 text-[14px]">{s.name} · {s.duration_min}′</button>
                  ))}
              </div>
              {chosen.length > 0 && <p className="c-muted mt-2 text-[13px]">{formatDuration(duration, t)} · {money(chosen.reduce((a, s) => a + Number(s.price), 0), shop.currency)}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('client')}><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label={t('phone')}><input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            </div>
            <Field label={t('note')}><textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </>
        )}
        {clash && duration > 0 && <p className="pill-warn rounded-2xl px-4 py-2.5 text-[13px]">{t('err_slot_taken')}</p>}
        {error && <ErrorNote error={error} />}
        <button type="submit" disabled={busy || !duration} className="btn-primary w-full rounded-full py-3 text-[15px] font-semibold">{t('save')}</button>
      </form>
    </Sheet>
  )
}
