import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CalendarCheck, Check, Copy, Scissors } from 'lucide-react'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { useAsync } from '../lib/useAsync.js'
import { formatDuration, minToLabel, nowInZone } from '../lib/time.js'
import { ErrorNote, LangSwitch, Shimmer, Stars, StatusPill, ThemeToggle } from '../components/ui.jsx'

export default function BookingPage() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const { t, money, dayLong } = useI18n()
  const q = useAsync(() => api.getBooking(token), [token])
  const b = q.data
  const isNew = params.get('new') === '1'

  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      await api.cancelBooking(token)
      q.setData({ ...b, status: 'cancelled' })
      setAsking(false)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    navigator.clipboard?.writeText(window.location.href.replace(/\?.*$/, '')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  return (
    <div className="min-h-dvh">
      <header className="header-bar sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between gap-3 px-4">
          {b ? (
            <Link to={`/${b.shop_slug}`} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#C08447] to-[#7C4F22] text-[#FFF8EE]"><Scissors size={16} /></span>
              <span className="serif c-title text-[20px] font-semibold">{t('bookAnother')}</span>
            </Link>
          ) : <span />}
          <div className="flex items-center gap-2"><LangSwitch /><ThemeToggle /></div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        {q.error ? <ErrorNote error="loadFailed" onRetry={q.reload} />
          : q.loading && !b ? (
            <div className="glass space-y-3 rounded-[28px] p-6">
              <Shimmer className="h-12 w-12 rounded-full" /><Shimmer className="h-8 w-2/3" /><Shimmer className="h-4 w-full" /><Shimmer className="h-4 w-4/5" />
            </div>
          ) : !b ? <ErrorNote error={{ code: 'booking_not_found' }} />
            : (
              <>
                <section className="glass rise rounded-[28px] p-6">
                  {b.status === 'booked' && isNew && (
                    <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#C08447] to-[#7C4F22] text-white shadow-lg">
                      <CalendarCheck size={22} />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <h1 className="serif c-title text-[34px] font-semibold leading-tight">
                      {b.status === 'booked' && isNew ? t('bookingConfirmed') : b.client_name}
                    </h1>
                    {!(b.status === 'booked' && isNew) && <StatusPill status={b.status} />}
                  </div>
                  {b.status === 'booked' && isNew && <p className="c-body mt-1 text-[14px]">{t('bookingSaved')}</p>}

                  <dl className="soft mt-5 space-y-2 rounded-2xl p-4 text-[15px]">
                    <Row label={t('stepTime')} value={<span className="capitalize">{dayLong(b.date)}, {minToLabel(b.start_min)}</span>} />
                    <Row label={t('services')} value={b.service_names.join(', ')} />
                    <Row label={t('duration')} value={formatDuration(b.duration_min, t)} />
                    <Row label={t('total')} value={<span className="font-semibold">{money(b.total_price)}</span>} />
                  </dl>

                  {b.status === 'cancelled' && <p className="c-muted mt-4 text-[14px]">{t('bookingCancelled')}</p>}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={copy} className="btn-ghost flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-medium">
                      {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? t('copied') : t('copyLink')}
                    </button>
                    {b.status === 'cancelled' && (
                      <Link to={`/${b.shop_slug}`} className="btn-primary rounded-full px-5 py-2.5 text-[14px] font-semibold">{t('bookAgain')}</Link>
                    )}
                    {b.status === 'booked' && !asking && (
                      <button type="button" onClick={() => setAsking(true)} className="btn-ghost btn-danger rounded-full px-4 py-2.5 text-[14px] font-medium">{t('cancelBooking')}</button>
                    )}
                  </div>
                  {asking && (
                    <div className="pill-bad rise mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
                      <span className="text-[14px] font-medium">{t('cancelAsk')}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setAsking(false)} className="btn-ghost rounded-full px-4 py-2 text-[14px]">{t('keep')}</button>
                        <button type="button" onClick={cancel} disabled={busy} className="rounded-full bg-[var(--bad)] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60">{t('yesCancel')}</button>
                      </div>
                    </div>
                  )}
                  {error && <div className="mt-3"><ErrorNote error={error} /></div>}
                </section>

                {b.status !== 'cancelled' && b.status !== 'no_show' && <Feedback booking={b} token={token} onDone={() => q.setData({ ...b, reviewed: true })} />}
              </>
            )}
      </main>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="c-muted shrink-0">{label}</dt>
      <dd className="c-title text-right">{value}</dd>
    </div>
  )
}

function Feedback({ booking, token, onDone }) {
  const { t } = useI18n()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const now = nowInZone(booking.timezone || 'Asia/Tashkent')
  const started = booking.status === 'done' || booking.date < now.date || (booking.date === now.date && booking.start_min <= now.minute)
  if (!started) {
    return <section className="soft rounded-[28px] p-5 text-center"><p className="c-muted text-[14px]">{t('feedbackLater')}</p></section>
  }
  if (booking.reviewed) {
    return <section className="glass rise rounded-[28px] p-6 text-center"><p className="serif c-title text-[24px] font-semibold">{t('thanksFeedback')}</p></section>
  }

  async function send(e) {
    e.preventDefault()
    if (!rating) return
    setBusy(true)
    setError(null)
    try {
      await api.submitReview(token, { rating, comment })
      onDone()
    } catch (err) {
      if (err.code === 'already_reviewed') onDone()
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={send} className="glass rounded-[28px] p-6">
      <h2 className="serif c-title text-[26px] font-semibold">{t('leaveFeedback')}</h2>
      <div className="mt-3"><Stars value={rating} onChange={setRating} size={30} label={t('leaveFeedback')} /></div>
      <textarea className="field mt-3" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('commentPlaceholder')} maxLength={1000} />
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
      <button type="submit" disabled={!rating || busy} className="btn-primary mt-4 w-full rounded-full py-3 text-[15px] font-semibold">
        {busy ? t('sending') : t('sendFeedback')}
      </button>
    </form>
  )
}
