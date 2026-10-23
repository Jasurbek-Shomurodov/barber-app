import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Clock, Instagram, MapPin, Phone, Scissors, Send, Users } from 'lucide-react'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { useAsync } from '../lib/useAsync.js'
import { useSession } from '../lib/useSession.js'
import { addDays, formatDuration, minToLabel, nowInZone } from '../lib/time.js'
import { availableStarts, isClosed, slotOptionsFor, totalDuration } from '../lib/slots.js'
import { hasTelegram } from '../lib/telegram.js'
import { ErrorNote, LangSwitch, Shimmer, Stars, TelegramLoginButton, ThemeSwitch } from '../components/ui.jsx'

const CONTACT_KEY = 'nb-contact'

function loadContact() {
  try { return JSON.parse(localStorage.getItem(CONTACT_KEY)) || {} } catch { return {} }
}

export default function ShopPage() {
  const { slug } = useParams()
  const shopQ = useAsync(() => api.getShopBySlug(slug), [slug])
  const shop = shopQ.data

  if (shopQ.error) return <Frame><div className="mx-auto max-w-xl px-4 py-16"><ErrorNote error="loadFailed" onRetry={shopQ.reload} /></div></Frame>
  if (shopQ.loading && !shop) return <Frame><ShopShimmer /></Frame>
  if (!shop) return <Frame><NotFound /></Frame>
  return <Frame shop={shop}><ShopBody shop={shop} /></Frame>
}

function Frame({ shop, children }) {
  const { t } = useI18n()
  return (
    <div className="min-h-dvh">
      <header className="header-bar sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#C08447] to-[#7C4F22] text-[#FFF8EE]">
              <Scissors size={16} />
            </span>
            <span className="serif c-title truncate text-[21px] font-semibold">{shop?.name || ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <LangSwitch />
            <ThemeSwitch />
          </div>
        </div>
      </header>
      {children}
      <footer className="c-muted px-4 pb-28 pt-10 text-center text-[12px] lg:pb-10">
        <Link to="/" className="hover:underline">{t('poweredBy')}</Link>
      </footer>
    </div>
  )
}

function NotFound() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="serif c-title text-4xl font-semibold">{t('shopNotFound')}</h1>
      <p className="c-body mt-3">{t('shopNotFoundHint')}</p>
    </div>
  )
}

function ShopShimmer() {
  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="glass space-y-3 rounded-[28px] p-6">
          <Shimmer className="h-9 w-2/3" />
          <Shimmer className="h-4 w-1/2" />
          <div className="flex gap-3 pt-2"><Shimmer className="h-14 w-32 rounded-2xl" /><Shimmer className="h-14 w-32 rounded-2xl" /></div>
        </div>
        {[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-[76px] w-full rounded-[22px]" />)}
      </div>
      <div className="hidden space-y-3 lg:block"><Shimmer className="h-64 w-full rounded-[28px]" /></div>
    </div>
  )
}

function ShopBody({ shop }) {
  const { t, tf, lang, money, weekdayShort, dayLong } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const servicesQ = useAsync(() => api.listServices(shop.id), [shop.id])
  const statsQ = useAsync(() => api.getPublicStats(shop.id), [shop.id])
  const reviewsQ = useAsync(() => api.listReviews(shop.id), [shop.id])

  const now = useMemo(() => nowInZone(shop.timezone), [shop.timezone])
  const lastDay = addDays(now.date, shop.booking_days)
  const busyQ = useAsync(() => api.getBusy(shop.id, now.date, lastDay), [shop.id, now.date, lastDay])

  // "Book the same again" links arrive with ?services=id,id
  const [picked, setPicked] = useState(() => (params.get('services') || '').split(',').filter(Boolean))
  const [telegram, setTelegram] = useState(null)
  const [waitName, setWaitName] = useState('')
  const [waitPhone, setWaitPhone] = useState('')
  const [waitState, setWaitState] = useState('idle') // idle | busy | done
  const [waitError, setWaitError] = useState(null)
  const [date, setDate] = useState(null)
  const [start, setStart] = useState(null)
  const saved = useMemo(loadContact, [])
  const [name, setName] = useState(saved.name || '')
  const [phone, setPhone] = useState(saved.phone || '+998 ')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const timeRef = useRef(null)
  const detailsRef = useRef(null)
  const session = useSession()

  // Signed-in clients: fill in what their account already knows; typed values win.
  useEffect(() => {
    if (!session) return
    api.getProfile().then((p) => {
      if (!p) return
      setName((v) => v.trim() || p.name)
      setPhone((v) => (v.replace(/\D/g, '').length > 3 ? v : p.phone || v))
    }).catch(() => {})
  }, [session])

  const services = servicesQ.data || []
  const chosen = services.filter((s) => picked.includes(s.id))
  const duration = totalDuration(chosen)
  const price = chosen.reduce((a, s) => a + Number(s.price), 0)

  const days = useMemo(() => Array.from({ length: shop.booking_days + 1 }, (_, i) => addDays(now.date, i)), [now.date, shop.booking_days])
  const slotsByDay = useMemo(() => {
    if (!duration || !busyQ.data) return {}
    const out = {}
    for (const d of days) {
      out[d] = availableStarts({ date: d, ...slotOptionsFor(shop), duration, busy: busyQ.data.filter((b) => b.date === d), now })
    }
    return out
  }, [duration, busyQ.data, days, shop, now])

  // Keep the chosen day/time valid when the service mix (and so the duration) changes.
  useEffect(() => {
    if (!duration) { setStart(null); return }
    if (date && start != null && !slotsByDay[date]?.includes(start)) setStart(null)
    if (!date && busyQ.data) setDate(days.find((d) => slotsByDay[d]?.length) || days[0])
  }, [duration, slotsByDay]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => {
    setError(null)
    const had = picked.length
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
    if (!had) setTimeout(() => timeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }
  const pickTime = (m) => {
    setStart(m)
    setError(null)
    setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  const ready = chosen.length && date && start != null && name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 9
  async function submit(e) {
    e?.preventDefault()
    if (!ready || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const token = await api.createBooking({ shopId: shop.id, serviceIds: picked, date, startMin: start, name, phone, note, lang, telegram })
      try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: name.trim(), phone: phone.trim() })) } catch { /* ignore */ }
      navigate(`/b/${token}?new=1`)
    } catch (err) {
      setError(err)
      if (err.code === 'slot_taken' || err.code === 'time_passed') {
        setStart(null)
        busyQ.reload()
        timeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      setSubmitting(false)
    }
  }

  const onTelegram = (user) => {
    setTelegram(user)
    if (!name.trim() && user?.first_name) setName([user.first_name, user.last_name].filter(Boolean).join(' '))
  }
  async function joinWaitlist(e) {
    e.preventDefault()
    setWaitState('busy'); setWaitError(null)
    try {
      await api.joinWaitlist({ shopId: shop.id, date, name: waitName || name, phone: waitPhone || phone, lang })
      setWaitState('done')
    } catch (err) { setWaitError(err); setWaitState('idle') }
  }
  useEffect(() => { setWaitState('idle'); setWaitError(null) }, [date])

  const stats = statsQ.data
  const daySlots = (date && slotsByDay[date]) || []
  const categories = [...new Set(services.map((s) => s.category || ''))]
  const groups = [
    ['morning', daySlots.filter((m) => m < 12 * 60)],
    ['afternoon', daySlots.filter((m) => m >= 12 * 60 && m < 17 * 60)],
    ['evening', daySlots.filter((m) => m >= 17 * 60)],
  ].filter(([, list]) => list.length)

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[1fr_380px] lg:py-8">
      <div className="min-w-0 space-y-5">
        {shop.status && shop.status !== 'approved' && (
          <p className="pill-warn rounded-2xl px-4 py-3 text-[14px]" role="status">{t('shopNotLiveNotice')}</p>
        )}
        {/* Hero */}
        <section className="glass rise rounded-[28px] p-5 sm:p-7">
          <h1 className="serif c-title text-[38px] font-semibold leading-[1.05] sm:text-[48px]">{shop.name}</h1>
          {shop.tagline && <p className="c-body mt-2 text-[15px]">{shop.tagline}</p>}
          <div className="mt-5 flex flex-wrap gap-2.5">
            <div className="soft flex items-center gap-3 rounded-2xl px-4 py-2.5">
              <Users size={18} className="c-gold" />
              {stats ? (
                <div className="leading-tight">
                  <div className="c-title text-[20px] font-semibold tabular-nums">{stats.clients}</div>
                  <div className="c-muted text-[12px]">{t('clientsServed')}</div>
                </div>
              ) : <Shimmer className="h-9 w-24" />}
            </div>
            <div className="soft flex items-center gap-3 rounded-2xl px-4 py-2.5">
              {stats ? (
                <div className="leading-tight">
                  <div className="flex items-center gap-2">
                    <span className="c-title text-[20px] font-semibold tabular-nums">{Number(stats.avg_rating).toFixed(1)}</span>
                    <Stars value={Number(stats.avg_rating)} />
                  </div>
                  <div className="c-muted text-[12px]">{stats.review_count} {t('reviewsCount')}</div>
                </div>
              ) : <Shimmer className="h-9 w-32" />}
            </div>
          </div>
          {(shop.address || shop.phone || shop.instagram || shop.telegram) && (
            <div className="c-body mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
              {shop.address && (shop.maps_url
                ? <a href={shop.maps_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline"><MapPin size={15} className="c-gold" />{shop.address}</a>
                : <span className="flex items-center gap-1.5"><MapPin size={15} className="c-gold" />{shop.address}</span>)}
              {shop.phone && <a href={`tel:${shop.phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 hover:underline"><Phone size={15} className="c-gold" />{shop.phone}</a>}
              {shop.instagram && <a href={`https://instagram.com/${shop.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline"><Instagram size={15} className="c-gold" />@{shop.instagram.replace(/^@/, '')}</a>}
              {shop.telegram && <a href={`https://t.me/${shop.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline"><Send size={15} className="c-gold" />@{shop.telegram.replace(/^@/, '')}</a>}
            </div>
          )}
        </section>

        {/* 1. Services */}
        <section>
          <StepTitle n={1} title={t('chooseServices')} hint={t('chooseServicesHint')} />
          {servicesQ.error ? <ErrorNote error="loadFailed" onRetry={servicesQ.reload} /> : (
            <div className="space-y-3">
              {servicesQ.loading && !servicesQ.data
                ? <div className="grid gap-2.5 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-[84px] rounded-[22px]" />)}</div>
                : categories.map((cat) => (
                  <div key={cat || '_'}>
                    {categories.length > 1 && cat && <h3 className="c-muted mb-1.5 text-[12px] font-medium uppercase tracking-wide">{cat}</h3>}
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {services.filter((s) => (s.category || '') === cat).map((s) => {
                  const on = picked.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(s.id)}
                      className={`glass group flex items-start gap-3 rounded-[22px] p-4 text-left transition ${on ? 'ring-2 ring-[#C08447]' : 'hover:-translate-y-0.5'}`}
                    >
                      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${on ? 'border-transparent bg-gradient-to-br from-[#C08447] to-[#7C4F22] text-white' : 'b-line border'}`}>
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="c-title block text-[16px] font-semibold">{s.name}</span>
                        {s.description && <span className="c-muted mt-0.5 block text-[13px] leading-snug">{s.description}</span>}
                        <span className="c-body mt-2 flex items-center gap-3 text-[13px]">
                          <span className="flex items-center gap-1"><Clock size={13} className="c-gold" />{formatDuration(s.duration_min, t)}</span>
                          <span className="font-semibold">{money(s.price, shop.currency)}</span>
                        </span>
                      </span>
                    </button>
                  )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* 2. Date & time */}
        <section ref={timeRef} className="scroll-mt-20">
          <StepTitle n={2} title={t('stepTime')} muted={!chosen.length} />
          {!chosen.length ? null : busyQ.error ? <ErrorNote error="loadFailed" onRetry={busyQ.reload} /> : (
            <div className="glass rise rounded-[24px] p-4">
              <div className="fade-edges no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {days.map((d, i) => {
                  const off = isClosed(shop, d)
                  const free = slotsByDay[d]?.length || 0
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={d === date}
                      disabled={off || !busyQ.data}
                      onClick={() => { setDate(d); setStart(null); setError(null) }}
                      className="chip flex w-[62px] shrink-0 flex-col items-center rounded-2xl py-2"
                    >
                      <span className="text-[11px] uppercase tracking-wide opacity-80">{i === 0 ? t('today') : i === 1 ? t('tomorrow') : weekdayShort(d)}</span>
                      <span className="text-[20px] font-semibold tabular-nums">{Number(d.slice(8))}</span>
                      <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${off ? 'bg-transparent' : free ? 'bg-current opacity-60' : 'bg-transparent'}`} />
                    </button>
                  )
                })}
              </div>
              {date && <p className="c-title mt-4 text-[15px] font-semibold capitalize">{dayLong(date)}</p>}
              {!busyQ.data ? (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <Shimmer key={i} className="h-10 rounded-xl" />)}</div>
              ) : isClosed(shop, date || now.date) ? (
                <p className="c-muted mt-3 text-[14px]">{t('dayOff')}</p>
              ) : !groups.length ? (
                <div className="soft mt-3 rounded-2xl p-4">
                  <p className="c-title text-[15px] font-semibold">{t('waitlistTitle')}</p>
                  <p className="c-muted mt-0.5 text-[13px]">{t('waitlistHint')}</p>
                  {waitState === 'done' ? <p className="pill-ok mt-3 rounded-xl px-3 py-2 text-[14px]">{t('waitlistJoined')}</p> : (
                    <form onSubmit={joinWaitlist} className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input className="field" placeholder={t('name')} value={waitName || name} onChange={(e) => setWaitName(e.target.value)} required />
                      <input className="field tabular-nums" type="tel" placeholder={t('phone')} value={waitPhone || phone} onChange={(e) => setWaitPhone(e.target.value)} required />
                      <button type="submit" disabled={waitState === 'busy'} className="btn-primary shrink-0 rounded-full px-5 py-2.5 text-[14px] font-semibold">{t('joinWaitlist')}</button>
                    </form>
                  )}
                  {waitError && <div className="mt-2"><ErrorNote error={waitError} /></div>}
                </div>
              ) : groups.map(([label, list]) => (
                <div key={label} className="mt-3">
                  <div className="c-muted mb-1.5 text-[12px] font-medium uppercase tracking-wide">{t(label)}</div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {list.map((m) => (
                      <button key={m} type="button" aria-pressed={m === start} onClick={() => pickTime(m)} className="chip rounded-xl py-2.5 text-[15px] font-semibold tabular-nums">
                        {minToLabel(m)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Details */}
        <section ref={detailsRef} className="scroll-mt-20">
          <StepTitle n={3} title={t('yourDetails')} muted={start == null} />
          {start != null && (
            <form onSubmit={submit} className="glass rise space-y-3 rounded-[24px] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="c-muted mb-1.5 block text-[13px] font-medium">{t('name')}</span>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                </label>
                <label className="block">
                  <span className="c-muted mb-1.5 block text-[13px] font-medium">{t('phone')}</span>
                  <input className="field tabular-nums" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" required />
                </label>
              </div>
              <label className="block">
                <span className="c-muted mb-1.5 block text-[13px] font-medium">{t('note')}</span>
                <textarea className="field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} maxLength={500} />
              </label>
              {hasTelegram() && (
                <div className="soft rounded-2xl p-3">
                  {telegram ? (
                    <p className="c-ok flex items-center gap-2 text-[14px] font-medium"><Check size={16} />{t('tgIdentified')}</p>
                  ) : (
                    <>
                      <p className="c-muted mb-2 text-[13px]">{t('tgRemindersHint')}</p>
                      <TelegramLoginButton onAuth={onTelegram} requestWrite />
                    </>
                  )}
                </div>
              )}
              {shop.cancel_hours > 0 && <p className="c-muted text-[12px]">{tf('policyNote', { h: shop.cancel_hours })}</p>}
              {session === null && (
                <p className="c-muted text-[12px]">
                  <Link to="/?auth=in&as=client" state={{ from: `/${shop.slug}` }} className="c-gold font-medium hover:underline">{t('signIn')}</Link> — {t('signInToSave')}
                </p>
              )}
              {session && <p className="c-muted text-[12px]">{t('savedToAccount')}</p>}
              {error && <ErrorNote error={error} />}
              <button type="submit" disabled={!ready || submitting} className="btn-primary hidden w-full rounded-full py-3.5 text-[16px] font-semibold lg:block">
                {submitting ? t('booking') : t('confirmBooking')}
              </button>
            </form>
          )}
        </section>
      </div>

      {/* Side column: summary (desktop), hours, reviews */}
      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <Summary {...{ chosen, duration, price, date, start, shop, ready, submitting, submit }} className="hidden lg:block" />
        <Reviews q={reviewsQ} />
        <Hours shop={shop} />
      </aside>

      {/* Mobile sticky bar */}
      {chosen.length > 0 && (
        <div className="header-bar fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1 leading-tight">
              <div className="c-title text-[16px] font-semibold">{money(price, shop.currency)}</div>
              <div className="c-muted truncate text-[12px]">
                {formatDuration(duration, t)}{date && start != null ? ` · ${weekdayShort(date)} ${minToLabel(start)}` : ''}
              </div>
            </div>
            <button
              type="button"
              disabled={start != null ? !ready || submitting : false}
              onClick={() => (start == null ? timeRef.current?.scrollIntoView({ behavior: 'smooth' }) : ready ? submit() : detailsRef.current?.scrollIntoView({ behavior: 'smooth' }))}
              className="btn-primary shrink-0 rounded-full px-6 py-3 text-[15px] font-semibold"
            >
              {start == null ? t('chooseTime') : submitting ? t('booking') : t('confirmBooking')}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function StepTitle({ n, title, hint, muted }) {
  return (
    <div className={`mb-3 flex items-baseline gap-3 ${muted ? 'opacity-45' : ''}`}>
      <span className="serif c-gold text-[26px] font-semibold leading-none">{n}</span>
      <div>
        <h2 className="serif c-title text-[26px] font-semibold leading-none">{title}</h2>
        {hint && !muted && <p className="c-muted mt-1 text-[13px]">{hint}</p>}
      </div>
    </div>
  )
}

function Summary({ chosen, duration, price, date, start, shop, ready, submitting, submit, className = '' }) {
  const { t, money, dayLong } = useI18n()
  return (
    <div className={`glass rounded-[28px] p-5 ${className}`}>
      <h3 className="serif c-title text-[24px] font-semibold">{t('total')}</h3>
      {chosen.length ? (
        <ul className="mt-3 space-y-1.5 text-[14px]">
          {chosen.map((s) => (
            <li key={s.id} className="flex justify-between gap-3"><span className="c-body">{s.name}</span><span className="c-title tabular-nums">{money(s.price, shop.currency)}</span></li>
          ))}
        </ul>
      ) : <p className="c-muted mt-2 text-[14px]">{t('chooseServices')}</p>}
      <div className="b-line mt-4 space-y-1 border-t pt-3 text-[14px]">
        <div className="flex justify-between"><span className="c-muted">{t('duration')}</span><span className="c-title">{duration ? formatDuration(duration, t) : '—'}</span></div>
        <div className="flex justify-between gap-3"><span className="c-muted">{t('stepTime')}</span><span className="c-title text-right capitalize">{date && start != null ? `${dayLong(date)}, ${minToLabel(start)}` : '—'}</span></div>
        <div className="flex justify-between pt-1 text-[17px] font-semibold"><span className="c-title">{t('total')}</span><span className="c-title tabular-nums">{money(price, shop.currency)}</span></div>
      </div>
      <button type="button" onClick={submit} disabled={!ready || submitting} className="btn-primary mt-4 w-full rounded-full py-3.5 text-[16px] font-semibold">
        {submitting ? t('booking') : t('confirmBooking')}
      </button>
    </div>
  )
}

function Reviews({ q }) {
  const { t, dayMonth } = useI18n()
  const list = (q.data || []).slice(0, 6)
  return (
    <section className="glass rounded-[28px] p-5">
      <h3 className="serif c-title text-[24px] font-semibold">{t('reviewsTitle')}</h3>
      {q.error ? <div className="mt-3"><ErrorNote error="loadFailed" onRetry={q.reload} /></div>
        : !q.data ? <div className="mt-3 space-y-3">{[0, 1, 2].map((i) => <Shimmer key={i} className="h-16 w-full" />)}</div>
          : !list.length ? <p className="c-muted mt-2 text-[14px]">{t('noReviewsYet')}</p>
            : (
              <ul className="mt-3 space-y-3">
                {list.map((r) => (
                  <li key={r.id} className="b-line border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="c-title text-[14px] font-semibold">{r.client_name || '—'}</span>
                      <Stars value={r.rating} size={12} />
                    </div>
                    {r.comment && <p className="c-body mt-1 text-[14px] leading-snug">{r.comment}</p>}
                    <p className="c-muted mt-1 text-[12px]">{dayMonth(r.created_at.slice(0, 10))}</p>
                  </li>
                ))}
              </ul>
            )}
    </section>
  )
}

function Hours({ shop }) {
  const { t, weekdayName } = useI18n()
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <section className="glass rounded-[28px] p-5">
      <h3 className="serif c-title text-[24px] font-semibold">{t('hours')}</h3>
      <ul className="mt-2 space-y-1 text-[14px]">
        {order.map((d) => {
          const h = shop.hours.find((x) => x.day === d)
          return (
            <li key={d} className="flex justify-between">
              <span className="c-body capitalize">{weekdayName(d)}</span>
              <span className={h?.off ? 'c-muted' : 'c-title tabular-nums'}>{!h || h.off ? t('closed') : `${minToLabel(h.open)} – ${minToLabel(h.close)}`}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
