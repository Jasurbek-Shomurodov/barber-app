import { useState } from 'react'
import { Clock, EyeOff, Plus } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { useAsync } from '../../lib/useAsync.js'
import { formatDuration } from '../../lib/time.js'
import { ErrorNote, Field, Sheet, Shimmer } from '../../components/ui.jsx'
import { PageTitle } from './AdminApp.jsx'

const DURATIONS = [15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120]

export default function Services({ shop }) {
  const { t, money } = useI18n()
  const q = useAsync(() => api.listServices(shop.id, { all: true }), [shop.id])
  const [editing, setEditing] = useState(null)

  return (
    <div className="max-w-3xl">
      <PageTitle title={t('nav_services')}>
        <button type="button" onClick={() => setEditing({ shop_id: shop.id, name: '', description: '', duration_min: 30, price: 0, active: true })}
          className="btn-primary flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold"><Plus size={16} />{t('addService')}</button>
      </PageTitle>
      {q.error ? <ErrorNote error="loadFailed" onRetry={q.reload} />
        : !q.data ? <div className="space-y-2.5">{[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-[76px] w-full rounded-[22px]" />)}</div>
          : !q.data.length ? <p className="glass c-muted rounded-[22px] p-6 text-center">{t('noServices')}</p>
            : (
              <ul className="space-y-2.5">
                {q.data.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setEditing(s)} className={`glass flex w-full items-center gap-4 rounded-[22px] p-4 text-left transition hover:-translate-y-0.5 ${s.active ? '' : 'opacity-60'}`}>
                      <div className="min-w-0 flex-1">
                        <div className="c-title flex items-center gap-2 text-[16px] font-semibold">{s.name}{!s.active && <span className="pill-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"><EyeOff size={11} />{t('hiddenFromClients')}</span>}</div>
                        {s.description && <div className="c-muted truncate text-[13px]">{s.description}</div>}
                      </div>
                      <div className="c-body flex shrink-0 items-center gap-1 text-[14px]"><Clock size={14} className="c-gold" />{formatDuration(s.duration_min, t)}</div>
                      <div className="c-title w-28 shrink-0 text-right text-[15px] font-semibold tabular-nums">{money(s.price, shop.currency)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
      {editing && <ServiceSheet service={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); q.reload() }} />}
    </div>
  )
}

function ServiceSheet({ service, onClose, onSaved }) {
  const { t } = useI18n()
  const [form, setForm] = useState(service)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [asking, setAsking] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function run(fn) {
    setBusy(true); setError(null)
    try { await fn(); onSaved() } catch (err) { setError(err); setBusy(false) }
  }
  const save = (e) => {
    e.preventDefault()
    const { id, shop_id, name, description, active } = form
    run(() => api.saveService({ id, shop_id, name: name.trim(), description: description.trim(), active, duration_min: Number(form.duration_min), price: Number(form.price) || 0 }))
  }

  return (
    <Sheet open onClose={onClose} title={service.id ? t('editService') : t('newService')}>
      <form onSubmit={save} className="space-y-3">
        <Field label={t('serviceName')}><input className="field" value={form.name} onChange={set('name')} required autoFocus /></Field>
        <Field label={t('description')}><textarea className="field" rows={2} value={form.description} onChange={set('description')} /></Field>
        <div>
          <span className="c-muted mb-1.5 block text-[13px] font-medium">{t('duration')}</span>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button key={d} type="button" aria-pressed={Number(form.duration_min) === d} onClick={() => setForm({ ...form, duration_min: d })} className="chip rounded-full px-3 py-1.5 text-[13px] tabular-nums">{formatDuration(d, t)}</button>
            ))}
            <input type="number" min={5} max={480} step={5} className="field !w-24 !rounded-full !py-1.5 text-[13px]" value={form.duration_min} onChange={set('duration_min')} aria-label={t('duration')} />
          </div>
        </div>
        <Field label={t('price')}><input type="number" min={0} step={1000} className="field tabular-nums" value={form.price} onChange={set('price')} /></Field>
        <label className="soft flex items-center justify-between rounded-2xl px-4 py-3">
          <span className="c-title text-[15px]">{t('active')}</span>
          <input type="checkbox" className="h-5 w-5 accent-[#B07A3A]" checked={form.active} onChange={set('active')} />
        </label>
        {error && <ErrorNote error={error} />}
        <button type="submit" disabled={busy} className="btn-primary w-full rounded-full py-3 text-[15px] font-semibold">{t('save')}</button>
        {service.id && !asking && <button type="button" onClick={() => setAsking(true)} className="btn-ghost btn-danger w-full rounded-full py-3 text-[15px]">{t('archive')}</button>}
        {asking && (
          <div className="pill-bad rise space-y-2 rounded-2xl p-4">
            <p className="text-[14px] font-medium">{t('archiveAsk')}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAsking(false)} className="btn-ghost flex-1 rounded-full py-2 text-[14px]">{t('keep')}</button>
              <button type="button" disabled={busy} onClick={() => run(() => api.archiveService(service.shop_id, service.id))} className="flex-1 rounded-full bg-[var(--bad)] py-2 text-[14px] font-semibold text-white">{t('archive')}</button>
            </div>
          </div>
        )}
      </form>
    </Sheet>
  )
}
