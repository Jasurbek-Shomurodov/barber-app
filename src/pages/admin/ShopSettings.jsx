import { useEffect, useState } from 'react'
import { Check, Copy, Download, LogOut, Send, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { labelToMin, minToLabel } from '../../lib/time.js'
import { hasTelegram, shopDeepLink } from '../../lib/telegram.js'
import { ErrorNote, Field, ThemeSwitch } from '../../components/ui.jsx'
import { PageTitle } from './AdminApp.jsx'

const ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function ShopSettings({ shop, setShop, onSignOut }) {
  const { t, weekdayName, dayMonth } = useI18n()
  const [form, setForm] = useState(shop)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [newDate, setNewDate] = useState('')
  const set = (k, num = false) => (e) => { setSaved(false); setForm({ ...form, [k]: num ? Number(e.target.value) : e.target.type === 'checkbox' ? e.target.checked : e.target.value }) }
  const setDay = (day, patch) => { setSaved(false); setForm({ ...form, hours: form.hours.map((h) => (h.day === day ? { ...h, ...patch } : h)) }) }

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const { name, tagline, address, phone, slug, hours, slot_step, lead_min, booking_days, buffer_min, cancel_hours, closed_dates, instagram, telegram, maps_url, notify_new_booking, daily_summary_hour, reminder_hours } = form
      const next = await api.updateShop(shop.id, {
        name: name.trim(), tagline, address, phone, slug: slug.trim().toLowerCase(), hours, slot_step, lead_min, booking_days,
        buffer_min: buffer_min ?? 0, cancel_hours: cancel_hours ?? 2, closed_dates: [...(closed_dates || [])].sort(),
        instagram: (instagram || '').replace(/^@/, '').trim(), telegram: (telegram || '').replace(/^@/, '').trim(), maps_url: (maps_url || '').trim(),
        notify_new_booking: notify_new_booking ?? true, daily_summary_hour: daily_summary_hour ?? null, reminder_hours: reminder_hours || [],
      })
      setShop(next)
      setForm(next)
      setSaved(true)
    } catch (err) { setError(err) } finally { setBusy(false) }
  }

  const toggleReminder = (h) => {
    setSaved(false)
    const cur = form.reminder_hours || []
    setForm({ ...form, reminder_hours: cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h].sort((a, b) => b - a) })
  }

  return (
    <form onSubmit={save} className="max-w-3xl space-y-4">
      <PageTitle title={t('nav_settings')}>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeSwitch />
          <button type="button" onClick={onSignOut} className="btn-ghost flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px]"><LogOut size={15} />{t('signOut')}</button>
        </div>
      </PageTitle>

      <ShareCard shop={shop} />

      <section className="glass space-y-3 rounded-[24px] p-5">
        <h2 className="serif c-title text-[24px] font-semibold">{t('settings')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('shopName')}><input className="field" value={form.name} onChange={set('name')} required /></Field>
          <Field label={t('shopSlug')}>
            <div className="field flex items-center gap-1 !py-0"><span className="c-muted text-[14px]">/</span>
              <input className="w-full bg-transparent py-[11px] outline-none" value={form.slug} onChange={set('slug')} pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" required />
            </div>
          </Field>
        </div>
        <Field label={t('tagline')}><textarea className="field" rows={2} value={form.tagline} onChange={set('tagline')} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('address')}><input className="field" value={form.address} onChange={set('address')} /></Field>
          <Field label={t('shopPhone')}><input className="field" type="tel" value={form.phone} onChange={set('phone')} /></Field>
        </div>
        <h3 className="c-muted pt-1 text-[13px] font-medium uppercase tracking-wide">{t('links')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('instagram')}><div className="field flex items-center gap-1 !py-0"><span className="c-muted">@</span><input className="w-full bg-transparent py-[11px] outline-none" value={form.instagram || ''} onChange={set('instagram')} /></div></Field>
          <Field label={t('telegramChannel')}><div className="field flex items-center gap-1 !py-0"><span className="c-muted">@</span><input className="w-full bg-transparent py-[11px] outline-none" value={form.telegram || ''} onChange={set('telegram')} /></div></Field>
          <Field label={t('mapsUrl')}><input className="field" type="url" value={form.maps_url || ''} onChange={set('maps_url')} placeholder="https://" /></Field>
        </div>
      </section>

      <section className="glass rounded-[24px] p-5">
        <h2 className="serif c-title text-[24px] font-semibold">{t('workingHours')}</h2>
        <ul className="mt-3 space-y-2">
          {ORDER.map((d) => {
            const h = form.hours.find((x) => x.day === d) || { day: d, open: 600, close: 1200, off: true }
            return (
              <li key={d} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <span className="c-title w-32 shrink-0 text-[15px] capitalize">{weekdayName(d)}</span>
                <input type="time" className="field !w-[120px] !py-2 tabular-nums" disabled={h.off} value={minToLabel(h.open)} onChange={(e) => setDay(d, { open: labelToMin(e.target.value) })} aria-label={t('open')} />
                <span className="c-muted">–</span>
                <input type="time" className="field !w-[120px] !py-2 tabular-nums" disabled={h.off} value={minToLabel(h.close)} onChange={(e) => setDay(d, { close: labelToMin(e.target.value) || 1440 })} aria-label={t('closeAt')} />
                <button type="button" aria-pressed={h.off} onClick={() => setDay(d, { off: !h.off })} className="chip ml-auto rounded-full px-3.5 py-1.5 text-[13px] sm:ml-2">{t('dayOffShort')}</button>
              </li>
            )
          })}
        </ul>
        <h3 className="c-muted mt-5 text-[13px] font-medium uppercase tracking-wide">{t('closedDates')}</h3>
        <p className="c-muted mt-0.5 text-[12px]">{t('closedDatesHint')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(form.closed_dates || []).map((d) => (
            <span key={d} className="chip flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-[13px]">{dayMonth(d)}
              <button type="button" aria-label={t('archive')} onClick={() => { setSaved(false); setForm({ ...form, closed_dates: form.closed_dates.filter((x) => x !== d) }) }} className="grid h-5 w-5 place-items-center rounded-full hover:bg-[var(--soft-strong)]"><X size={12} /></button>
            </span>
          ))}
          <input type="date" className="field !w-auto !py-1.5 text-[13px]" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label={t('addDate')} />
          <button type="button" disabled={!newDate || form.closed_dates?.includes(newDate)} onClick={() => { setSaved(false); setForm({ ...form, closed_dates: [...(form.closed_dates || []), newDate] }); setNewDate('') }} className="btn-ghost rounded-full px-3.5 py-1.5 text-[13px]">{t('addDate')}</button>
        </div>
      </section>

      <section className="glass rounded-[24px] p-5">
        <h2 className="serif c-title text-[24px] font-semibold">{t('bookingRules')}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label={t('slotStep')}>
            <select className="field" value={form.slot_step} onChange={set('slot_step', true)}>
              {[5, 10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>{n} {t('min')}</option>)}
            </select>
          </Field>
          <Field label={t('leadTime')}>
            <select className="field" value={form.lead_min} onChange={set('lead_min', true)}>
              {[0, 15, 30, 60, 120, 180, 1440].map((n) => <option key={n} value={n}>{n} {t('minAhead')}</option>)}
            </select>
          </Field>
          <Field label={t('bookingWindow')}>
            <select className="field" value={form.booking_days} onChange={set('booking_days', true)}>
              {[7, 14, 21, 30, 60, 90].map((n) => <option key={n} value={n}>{n} {t('days')}</option>)}
            </select>
          </Field>
          <Field label={t('bufferTime')}>
            <select className="field" value={form.buffer_min ?? 0} onChange={set('buffer_min', true)}>
              {[0, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} {t('min')}</option>)}
            </select>
          </Field>
          <Field label={t('cancelHours')}>
            <select className="field" value={form.cancel_hours ?? 2} onChange={set('cancel_hours', true)}>
              {[0, 1, 2, 3, 6, 12, 24, 48].map((n) => <option key={n} value={n}>{n} {t('hoursBefore')}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="glass rounded-[24px] p-5">
        <h2 className="serif c-title text-[24px] font-semibold">{t('telegramSection')}</h2>
        <TelegramConnect shop={shop} setShop={(s) => { setShop(s); setForm((f) => ({ ...f, owner_chat_id: s.owner_chat_id })) }} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="soft flex items-center justify-between rounded-2xl px-4 py-3">
            <span className="c-title text-[15px]">{t('notifyNewBooking')}</span>
            <input type="checkbox" className="h-5 w-5 accent-[#B07A3A]" checked={form.notify_new_booking ?? true} onChange={set('notify_new_booking')} />
          </label>
          <Field label={t('dailySummary')}>
            <select className="field" value={form.daily_summary_hour ?? ''} onChange={(e) => { setSaved(false); setForm({ ...form, daily_summary_hour: e.target.value === '' ? null : Number(e.target.value) }) }}>
              <option value="">{t('summaryOff')}</option>
              {[6, 7, 8, 9, 10].map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <span className="c-muted mb-1.5 block text-[13px] font-medium">{t('reminderHours')}</span>
          <div className="flex flex-wrap gap-1.5">
            {[48, 24, 12, 3, 2, 1].map((h) => (
              <button key={h} type="button" aria-pressed={(form.reminder_hours || []).includes(h)} onClick={() => toggleReminder(h)} className="chip rounded-full px-3.5 py-1.5 text-[13px] tabular-nums">{h} {t('h')}</button>
            ))}
          </div>
          <p className="c-muted mt-1 text-[12px]">{t('reminderHoursHint')}</p>
        </div>
      </section>

      {error && <ErrorNote error={error} />}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary rounded-full px-7 py-3 text-[15px] font-semibold">{t('saveChanges')}</button>
        {saved && <span className="c-ok flex items-center gap-1.5 text-[14px] font-medium"><Check size={16} />{t('saved')}</span>}
      </div>
    </form>
  )
}

function TelegramConnect({ shop, setShop }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  if (!hasTelegram()) return <p className="c-muted mt-2 text-[14px]">{t('telegramNotConfigured')}</p>
  if (shop.owner_chat_id) return <p className="c-ok mt-2 flex items-center gap-2 text-[15px] font-medium"><Check size={18} />{t('tgConnected')}</p>
  async function connect() {
    setBusy(true)
    window.open(shopDeepLink(shop.telegram_link_code), '_blank', 'noopener')
    // The bot links the chat within a second or two; re-read the shop a few times.
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const next = await api.linkShopTelegram(shop.id).catch(() => null)
      if (next?.owner_chat_id) { setShop(next); break }
    }
    setBusy(false)
  }
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <p className="c-muted text-[14px]">{t('tgConnectHint')}</p>
      <button type="button" disabled={busy} onClick={connect} className="btn-primary flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold"><Send size={15} />{t('tgConnect')}</button>
    </div>
  )
}

function ShareCard({ shop }) {
  const { t } = useI18n()
  const link = `${window.location.origin}/${shop.slug}`
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let alive = true
    import('qrcode').then((m) => m.toDataURL(link, { width: 480, margin: 1, color: { dark: '#2A221B', light: '#FFFFFF' } })).then((url) => alive && setQr(url)).catch(() => {})
    return () => { alive = false }
  }, [link])
  const copy = () => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => {})
  return (
    <section className="glass flex flex-wrap items-center gap-5 rounded-[24px] p-5">
      {qr ? <img src={qr} alt="QR" width={112} height={112} className="rounded-2xl bg-white p-1.5" /> : <div className="shimmer h-28 w-28 rounded-2xl" />}
      <div className="min-w-0 flex-1">
        <h2 className="serif c-title text-[24px] font-semibold">{t('shareTitle')}</h2>
        <a href={link} target="_blank" rel="noreferrer" className="c-gold block truncate text-[15px] font-medium hover:underline">{link.replace(/^https?:\/\//, '')}</a>
        <p className="c-muted mt-1 text-[13px]">{t('shareHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="btn-ghost flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? t('copied') : t('copyLinkBtn')}</button>
          {qr && <a href={qr} download={`${shop.slug}-qr.png`} className="btn-ghost flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium"><Download size={15} />{t('downloadQr')}</a>}
        </div>
      </div>
    </section>
  )
}
