import { useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { useAsync } from '../../lib/useAsync.js'
import { ErrorNote, Shimmer, Stars } from '../../components/ui.jsx'
import { PageTitle } from './AdminApp.jsx'

export default function Feedback({ shop }) {
  const { t, dayMonth } = useI18n()
  const q = useAsync(() => api.listReviews(shop.id, { all: true }), [shop.id])
  const [filter, setFilter] = useState(0)
  const [error, setError] = useState(null)
  const list = q.data || []
  const counts = useMemo(() => [5, 4, 3, 2, 1].map((n) => [n, list.filter((r) => r.rating === n).length]), [list])
  const avg = list.length ? list.reduce((a, r) => a + r.rating, 0) / list.length : 0
  const shown = filter ? list.filter((r) => r.rating === filter) : list

  async function toggle(r) {
    setError(null)
    try {
      await api.setReviewHidden(shop.id, r.id, !r.hidden)
      q.setData(list.map((x) => (x.id === r.id ? { ...x, hidden: !r.hidden } : x)))
    } catch (err) { setError(err) }
  }

  return (
    <div className="max-w-4xl">
      <PageTitle title={t('feedbackTitle')} />
      {q.error ? <ErrorNote error="loadFailed" onRetry={q.reload} /> : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <section className="glass h-fit rounded-[24px] p-5">
            {q.data ? <>
              <div className="serif c-title text-[56px] font-semibold leading-none">{avg.toFixed(1)}</div>
              <div className="mt-2"><Stars value={avg} size={18} /></div>
              <div className="c-muted mt-1 text-[13px]">{list.length} {t('reviewsCount')}</div>
              <ul className="mt-4 space-y-1.5">
                {counts.map(([n, c]) => (
                  <li key={n}>
                    <button type="button" onClick={() => setFilter(filter === n ? 0 : n)} aria-pressed={filter === n}
                      className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] ${filter === n ? 'bg-[var(--soft-strong)]' : ''}`}>
                      <span className="c-title w-3 tabular-nums">{n}</span>
                      <div className="soft h-2 flex-1 overflow-hidden rounded-full"><div className="h-full rounded-full bg-gradient-to-r from-[#A86D33] to-[#D9A466]" style={{ width: `${list.length ? (c / list.length) * 100 : 0}%` }} /></div>
                      <span className="c-muted w-6 text-right tabular-nums">{c}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </> : <div className="space-y-3"><Shimmer className="h-14 w-20" /><Shimmer className="h-4 w-28" />{[0, 1, 2, 3, 4].map((i) => <Shimmer key={i} className="h-3 w-full" />)}</div>}
          </section>
          <section className="space-y-2.5">
            {error && <ErrorNote error={error} />}
            {!q.data ? [0, 1, 2].map((i) => <Shimmer key={i} className="h-24 w-full rounded-[22px]" />)
              : !shown.length ? <p className="glass c-muted rounded-[22px] p-6 text-center text-[14px]">{t('noFeedback')}</p>
                : shown.map((r) => (
                  <article key={r.id} className={`glass rounded-[22px] p-4 ${r.hidden ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="c-title font-semibold">{r.client_name || '—'}</span>
                        <Stars value={r.rating} size={13} />
                      </div>
                      <div className="flex items-center gap-2">
                        {r.hidden && <span className="pill-muted rounded-full px-2 py-0.5 text-[11px]">{t('hiddenTag')}</span>}
                        <span className="c-muted text-[12px]">{dayMonth(r.created_at.slice(0, 10))}</span>
                        <button type="button" onClick={() => toggle(r)} className="btn-ghost grid h-8 w-8 place-items-center rounded-full" title={r.hidden ? t('show') : t('hide')} aria-label={r.hidden ? t('show') : t('hide')}>
                          {r.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      </div>
                    </div>
                    {r.comment && <p className="c-body mt-2 text-[14px] leading-relaxed">{r.comment}</p>}
                  </article>
                ))}
          </section>
        </div>
      )}
    </div>
  )
}
