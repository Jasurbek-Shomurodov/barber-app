import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CalendarDays, Clock, ExternalLink, Phone, Scissors, Send, Star } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { useAsync } from '../../lib/useAsync.js'
import { useSession } from '../../lib/useSession.js'
import AccountShell from '../../components/AccountShell.jsx'
import { ErrorNote, Shimmer } from '../../components/ui.jsx'

const FILTERS = ['all', 'pending', 'approved', 'suspended']
const STATUS_PILL = { pending: 'pill-warn', approved: 'pill-ok', suspended: 'pill-bad' }

/** /owner: the platform admin's view of every barber on the site, with approval. */
export default function OwnerApp() {
  const session = useSession()
  if (session === null) return <Navigate to="/?auth=in" replace state={{ from: '/owner' }} />
  if (session === undefined) return <AccountShell wide><OwnerShimmer /></AccountShell>
  return <OwnerGate />
}

function OwnerGate() {
  const { t } = useI18n()
  const adminQ = useAsync(() => api.isPlatformAdmin(), [])
  if (adminQ.error) return <AccountShell wide><ErrorNote error="loadFailed" onRetry={adminQ.reload} /></AccountShell>
  if (adminQ.data === undefined) return <AccountShell wide><OwnerShimmer /></AccountShell>
  if (!adminQ.data) {
    return (
      <AccountShell>
        <div className="glass rounded-[28px] p-6 text-center">
          <p className="c-body text-[15px]">{t('ownerNotAllowed')}</p>
          <Link to="/" className="btn-primary mt-4 inline-flex rounded-full px-5 py-2.5 text-[14px] font-semibold">{t('goHome')}</Link>
        </div>
      </AccountShell>
    )
  }
  return <Owner />
}

function OwnerShimmer() {
  return (
    <div className="space-y-4">
      <Shimmer className="h-10 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-[84px] rounded-[22px]" />)}</div>
      {[0, 1, 2].map((i) => <Shimmer key={i} className="h-[132px] w-full rounded-[24px]" />)}
    </div>
  )
}

function Owner() {
  const { t } = useI18n()
  const q = useAsync(() => api.adminListShops(), [])
  const [filter, setFilter] = useState('all')
  const shops = q.data || []
  const count = (f) => (f === 'all' ? shops.length : shops.filter((s) => s.status === f).length)
  const shown = filter === 'all' ? shops : shops.filter((s) => s.status === filter)
  const sum = (k) => shops.reduce((a, s) => a + Number(s[k] || 0), 0)

  const setStatus = async (shop, status) => {
    await api.adminSetShopStatus(shop.id, status)
    q.setData(shops.map((s) => (s.id === shop.id ? { ...s, status } : s)))
  }

  const links = <Link to="/admin" className="btn-ghost hidden rounded-full px-3.5 py-2 text-[13px] font-medium sm:block">{t('ownerMyShop')}</Link>

  return (
    <AccountShell wide title={t('ownerTitle')} links={links}>
      {q.error && !q.data ? <ErrorNote error="loadFailed" onRetry={q.reload} /> : !q.data ? <OwnerShimmer /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label={t('ownerBarbers')} value={shops.length} />
            <Tile label={t('ownerPending')} value={count('pending')} accent={count('pending') > 0} />
            <Tile label={t('ownerUpcoming')} value={sum('upcoming')} />
            <Tile label={t('visitsDone')} value={sum('visits')} />
          </div>

          <div className="soft no-scrollbar mb-4 flex w-fit max-w-full overflow-x-auto rounded-full p-0.5 text-[14px] font-medium">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full px-4 py-1.5 ${filter === f ? 'bg-[var(--soft-strong)] c-title shadow-sm' : 'c-muted'}`}>
                {t(f === 'all' ? 'allRatings' : `shopStatus_${f}`)} <span className="tabular-nums opacity-70">{count(f)}</span>
              </button>
            ))}
          </div>

          {!shown.length ? <p className="glass c-muted rounded-[22px] p-6 text-center">{shops.length ? t('ownerEmptyFilter') : t('ownerEmpty')}</p> : (
            <ul className="space-y-3">{shown.map((s) => <ShopCard key={s.id} shop={s} onStatus={setStatus} />)}</ul>
          )}
        </>
      )}
    </AccountShell>
  )
}

function Tile({ label, value, accent = false }) {
  return (
    <div className="glass rounded-[22px] p-4">
      <div className="c-muted text-[12px] font-medium uppercase tracking-wide">{label}</div>
      <div className={`serif mt-1 text-[30px] font-semibold leading-none tabular-nums ${accent ? 'c-gold' : 'c-title'}`}>{value}</div>
    </div>
  )
}

function ShopCard({ shop: s, onStatus }) {
  const { t, money, dateTime } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const act = async (status) => {
    setBusy(true); setError(null)
    try { await onStatus(s, status) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <li className="glass rounded-[24px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="serif c-title text-[24px] font-semibold leading-tight">{s.name}</h2>
            <span className={`${STATUS_PILL[s.status]} rounded-full px-2.5 py-0.5 text-[12px] font-semibold`}>{t(`shopStatus_${s.status}`)}</span>
          </div>
          <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="c-gold mt-0.5 inline-flex items-center gap-1 text-[14px] hover:underline">/{s.slug}<ExternalLink size={13} /></a>
        </div>
        <div className="flex gap-2">
          {s.status !== 'approved' && (
            <button type="button" disabled={busy} onClick={() => act('approved')} className="btn-primary rounded-full px-5 py-2 text-[14px] font-semibold">
              {s.status === 'pending' ? t('approve') : t('reactivate')}
            </button>
          )}
          {s.status !== 'suspended' && (
            <button type="button" disabled={busy} onClick={() => act('suspended')} className="btn-ghost btn-danger rounded-full px-4 py-2 text-[14px] font-medium">{t('suspend')}</button>
          )}
        </div>
      </div>
      <div className="c-body mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
        {s.owner_name && <span className="c-title font-medium">{s.owner_name}</span>}
        {s.owner_phone && <a href={`tel:${s.owner_phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 hover:underline"><Phone size={14} className="c-gold" />{s.owner_phone}</a>}
        {s.owner_telegram && <a href={`https://t.me/${s.owner_telegram}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline"><Send size={14} className="c-gold" />@{s.owner_telegram}</a>}
        <span className="c-muted flex items-center gap-1.5"><Clock size={14} />{t('ownerJoined')} {dateTime(s.created_at)}</span>
      </div>
      <dl className="soft mt-3 grid grid-cols-2 gap-3 rounded-2xl p-3 text-[13px] sm:grid-cols-4">
        <Stat icon={Scissors} label={t('nav_services')} value={s.services} />
        <Stat icon={CalendarDays} label={t('ownerUpcoming')} value={s.upcoming} />
        <Stat label={t('revenue')} value={`${s.visits} · ${money(s.revenue, s.currency)}`} />
        <Stat icon={Star} label={t('avgRating')} value={s.review_count ? `${Number(s.avg_rating).toFixed(1)} · ${s.review_count}` : '—'} />
      </dl>
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
    </li>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <dt className="c-muted flex items-center gap-1">{Icon && <Icon size={12} />}{label}</dt>
      <dd className="c-title truncate text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
