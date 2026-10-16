import { useState } from 'react'
import { Check, LogOut } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { labelToMin, minToLabel } from '../../lib/time.js'
import { ErrorNote, Field, ThemeToggle } from '../../components/ui.jsx'
import { PageTitle } from './AdminApp.jsx'

const ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function ShopSettings({ shop, setShop, onSignOut }) {
  const { t, weekdayName } = useI18n()
  const [form, setForm] = useState(shop)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const set = (k, num = false) => (e) => { setSaved(false); setForm({ ...form, [k]: num ? Number(e.target.value) : e.target.value }) }
  const setDay = (day, patch) => { setSaved(false); setForm({ ...form, hours: form.hours.map((h) => (h.day === day ? { ...h, ...patch } : h)) }) }

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const { name, tagline, address, phone, slug, hours, slot_step, lead_min, booking_days } = form
      const next = await api.updateShop(shop.id, { name: name.trim(), tagline, address, phone, slug: slug.trim().toLowerCase(), hours, slot_step, lead_min, booking_days })
      setShop(next)
      setSaved(true)
    } catch (err) { setError(err) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="max-w-3xl space-y-4">
      <PageTitle title={t('nav_settings')}>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button type="button" onClick={onSignOut} className="btn-ghost flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px]"><LogOut size={15} />{t('signOut')}</button>
        </div>
      </PageTitle>

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
