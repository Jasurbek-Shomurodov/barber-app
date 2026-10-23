import { Link, Navigate } from 'react-router-dom'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { useAsync } from '../lib/useAsync.js'
import { useSession } from '../lib/useSession.js'
import { formatDuration, minToLabel, nowInZone } from '../lib/time.js'
import AccountShell from '../components/AccountShell.jsx'
import { ErrorNote, Shimmer, StatusPill } from '../components/ui.jsx'

/** /me: a signed-in client's bookings across every barber. */
export default function MyBookings() {
  const session = useSession()
  if (session === null) return <Navigate to="/?auth=in&as=client" replace state={{ from: '/me' }} />
  if (session === undefined) return <AccountShell><ListShimmer /></AccountShell>
  return <List />
}

function ListShimmer() {
  return <div className="space-y-3"><Shimmer className="h-10 w-48" />{[0, 1, 2].map((i) => <Shimmer key={i} className="h-[112px] w-full rounded-[24px]" />)}</div>
}

const isUpcoming = (b) => {
  if (b.status !== 'booked') return false
  const now = nowInZone(b.timezone)
  return b.date > now.date || (b.date === now.date && b.start_min + b.duration_min > now.minute)
}

function List() {
  const { t } = useI18n()
  const q = useAsync(() => api.myBookings(), [])
  const rows = q.data || []
  // Newest first from the server; upcoming reads better soonest first.
  const upcoming = rows.filter(isUpcoming).reverse()
  const past = rows.filter((b) => !isUpcoming(b))

  return (
    <AccountShell title={t('myBookings')}>
      {q.error && !q.data ? <ErrorNote error="loadFailed" onRetry={q.reload} /> : !q.data ? <ListShimmer /> : !rows.length ? (
        <p className="glass c-muted rounded-[22px] p-6 text-center text-[15px]">{t('myBookingsEmpty')}</p>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && <Group title={t('upcoming')} rows={upcoming} />}
          {past.length > 0 && <Group title={t('pastVisits')} rows={past} />}
        </div>
      )}
    </AccountShell>
  )
}

function Group({ title, rows }) {
  return (
    <section>
      <h2 className="c-muted mb-2 text-[13px] font-medium uppercase tracking-wide">{title} · {rows.length}</h2>
      <ul className="space-y-2.5">{rows.map((b) => <Visit key={b.token} b={b} />)}</ul>
    </section>
  )
}

function Visit({ b }) {
  const { t, money, dayLong } = useI18n()
  return (
    <li className="glass rounded-[24px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="serif c-title truncate text-[22px] font-semibold leading-tight">{b.shop_name}</div>
          <div className="c-body mt-0.5 text-[14px] capitalize">{dayLong(b.date)}, {minToLabel(b.start_min)} · {formatDuration(b.duration_min, t)}</div>
        </div>
        <StatusPill status={b.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="c-muted min-w-0 truncate text-[14px]">{b.service_names.join(', ')} · <span className="c-title font-semibold">{money(b.total_price, b.currency)}</span></span>
        <div className="flex gap-2">
          {b.status !== 'booked' && (
            <Link to={`/${b.shop_slug}?services=${(b.service_ids || []).join(',')}`} className="btn-ghost flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"><RotateCcw size={14} />{t('bookAgain')}</Link>
          )}
          <Link to={`/b/${b.token}`} className="btn-primary flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-semibold">{t('openBooking')}<ChevronRight size={14} /></Link>
        </div>
      </div>
    </li>
  )
}
