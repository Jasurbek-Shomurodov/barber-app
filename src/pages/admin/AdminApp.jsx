import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, ExternalLink, LogOut, MessageSquareHeart, Scissors, Settings, Users } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useI18n } from '../../lib/i18n.jsx'
import { ErrorNote, Field, LangSwitch, Logo, Shimmer, TelegramLoginButton, ThemeSwitch } from '../../components/ui.jsx'
import { hasTelegram } from '../../lib/telegram.js'
import CalendarView from './CalendarView.jsx'
import Services from './Services.jsx'
import Clients from './Clients.jsx'
import Feedback from './Feedback.jsx'
import ShopSettings from './ShopSettings.jsx'

export default function AdminApp() {
  const [session, setSession] = useState(undefined)
  const [shop, setShop] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getSession().then(setSession).catch(setError)
    return api.onAuthChange(setSession)
  }, [])

  useEffect(() => {
    if (!session) { setShop(session === null ? null : undefined); return }
    setShop(undefined)
    api.getMyShop().then(setShop).catch(setError)
  }, [session])

  if (error) return <Centered><ErrorNote error="loadFailed" onRetry={() => window.location.reload()} /></Centered>
  if (session === null) return <Login onSession={setSession} />
  if (session === undefined || shop === undefined) return <AdminShimmer />
  if (!shop) return <CreateShop onCreated={setShop} />
  return <Layout shop={shop} setShop={setShop} onSignOut={() => api.signOut().then(() => setSession(null))} />
}

function Centered({ children }) {
  return <div className="grid min-h-dvh place-items-center px-4">{<div className="w-full max-w-sm">{children}</div>}</div>
}

function AdminShimmer() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-60 shrink-0 space-y-3 p-4 md:block">{[0, 1, 2, 3, 4].map((i) => <Shimmer key={i} className="h-10 w-full rounded-2xl" />)}</div>
      <div className="flex-1 space-y-4 p-4 md:p-8"><Shimmer className="h-10 w-64" /><Shimmer className="h-[60vh] w-full rounded-[28px]" /></div>
    </div>
  )
}

function Login({ onSession }) {
  const { t } = useI18n()
  // Sign-in vs sign-up lives in the URL so the browser back button undoes the switch.
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'signup' ? 'up' : 'in'
  const setMode = (next) => {
    if (next === mode) return
    setError(null); setNotice('')
    setParams(next === 'up' ? { mode: 'signup' } : {})
  }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')

  const onTelegram = useCallback(async (user) => {
    setBusy(true); setError(null)
    try { onSession(await api.telegramSignIn(user)) } catch (err) { setError(err); setBusy(false) }
  }, [onSession])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice('')
    try {
      const s = mode === 'in' ? await api.signIn(email, password) : await api.signUp(email, password)
      if (s) onSession(s)
      else setNotice(t('checkEmail'))
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <div className="mb-6 flex items-center justify-between gap-2">
        <Link to="/" className="btn-ghost flex h-9 items-center gap-1.5 rounded-full pl-2.5 pr-3.5 text-[14px] font-medium"><ArrowLeft size={16} />{t('back')}</Link>
        <div className="flex gap-2"><LangSwitch /><ThemeSwitch /></div>
      </div>
      <form onSubmit={submit} className="glass rise space-y-3 rounded-[28px] p-6">
        <div className="flex items-center gap-2.5"><Logo size={30} /><span className="serif c-title text-[22px] font-semibold">Barber</span></div>
        <div className="soft relative grid grid-cols-2 rounded-full p-1 text-[14px] font-semibold" role="tablist">
          <span aria-hidden="true" className="auth-tab-pill absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full" style={{ transform: mode === 'up' ? 'translateX(100%)' : 'none' }} />
          {[['in', 'signIn'], ['up', 'signUp']].map(([code, label]) => (
            <button key={code} type="button" role="tab" aria-selected={mode === code} onClick={() => setMode(code)} className={`relative z-10 rounded-full py-2 transition-colors duration-300 ${mode === code ? 'c-title' : 'c-muted'}`}>{t(label)}</button>
          ))}
        </div>
        <h1 key={mode} className={`serif c-title text-[32px] font-semibold ${mode === 'up' ? 'swap-from-right' : 'swap-from-left'}`}>{mode === 'in' ? t('barberLogin') : t('signUp')}</h1>
        {hasTelegram() && <>
          <TelegramLoginButton onAuth={onTelegram} />
          <div className="c-muted flex items-center gap-3 text-[12px]"><span className="b-line h-px flex-1 border-t" />{t('orEmail')}<span className="b-line h-px flex-1 border-t" /></div>
        </>}
        <Field label={t('email')}><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label={t('password')}><input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required /></Field>
        {error && <ErrorNote error={error} />}
        {notice && <p className="pill-ok rounded-2xl px-4 py-3 text-[14px]">{notice}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full rounded-full py-3 font-semibold"><span key={mode} className="swap-fade inline-block">{mode === 'in' ? t('signIn') : t('signUp')}</span></button>
        <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className="c-gold w-full text-center text-[14px] font-medium hover:underline">
          <span key={mode} className="swap-fade inline-block">{mode === 'in' ? t('noAccount') : t('haveAccount')}</span>
        </button>
      </form>
    </Centered>
  )
}

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40)

function CreateShop({ onCreated }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try { onCreated(await api.createMyShop(slug, name)) } catch (err) { setError(err); setBusy(false) }
  }
  return (
    <Centered>
      <form onSubmit={submit} className="glass rise space-y-3 rounded-[28px] p-6">
        <h1 className="serif c-title text-[32px] font-semibold">{t('createShop')}</h1>
        <Field label={t('shopName')}>
          <input className="field" value={name} required onChange={(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)) }} />
        </Field>
        <Field label={t('shopSlug')} hint={t('createShopHint')}>
          <div className="field flex items-center gap-1 !py-0"><span className="c-muted text-[14px]">{window.location.host}/</span>
            <input className="w-full bg-transparent py-[11px] outline-none" value={slug} required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)) }} />
          </div>
        </Field>
        {error && <ErrorNote error={error} />}
        <button type="submit" disabled={busy} className="btn-primary w-full rounded-full py-3 font-semibold">{t('createShopBtn')}</button>
      </form>
    </Centered>
  )
}

const NAV = [
  ['', CalendarDays, 'nav_calendar'],
  ['services', Scissors, 'nav_services'],
  ['clients', Users, 'nav_clients'],
  ['feedback', MessageSquareHeart, 'nav_feedback'],
  ['settings', Settings, 'nav_settings'],
]

function Layout({ shop, setShop, onSignOut }) {
  const { t } = useI18n()
  const link = `${window.location.origin}/${shop.slug}`
  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-1 p-4">
          <div className="mb-4 flex items-center gap-2.5 px-2"><Logo size={30} /><span className="serif c-title truncate text-[22px] font-semibold">{shop.name}</span></div>
          {NAV.map(([path, Icon, label]) => (
            <NavLink key={label} to={`/admin/${path}`} end={!path}
              className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-medium transition ${isActive ? 'glass c-title' : 'c-body hover:bg-[var(--soft)]'}`}>
              <Icon size={18} className="c-gold" />{t(label)}
            </NavLink>
          ))}
          <div className="mt-auto space-y-2">
            <a href={link} target="_blank" rel="noreferrer" className="soft flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 text-[13px]">
              <span className="min-w-0"><span className="c-muted block text-[11px]">{t('publicPage')}</span><span className="c-title block truncate">/{shop.slug}</span></span>
              <ExternalLink size={15} className="c-gold shrink-0" />
            </a>
            <div className="flex items-center justify-between gap-2 px-1">
              <LangSwitch />
              <div className="flex gap-1.5">
                <ThemeSwitch />
                <button type="button" onClick={onSignOut} className="btn-ghost grid h-9 w-9 place-items-center rounded-full" aria-label={t('signOut')} title={t('signOut')}><LogOut size={16} /></button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="header-bar sticky top-0 z-30 md:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2"><Logo size={28} /><span className="serif c-title truncate text-[20px] font-semibold">{shop.name}</span></div>
          <div className="flex items-center gap-1.5">
            <a href={link} target="_blank" rel="noreferrer" className="btn-ghost grid h-9 w-9 place-items-center rounded-full" aria-label={t('publicPage')}><ExternalLink size={16} /></a>
            <LangSwitch />
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">
        <Routes>
          <Route index element={<CalendarView shop={shop} />} />
          <Route path="services" element={<Services shop={shop} />} />
          <Route path="clients" element={<Clients shop={shop} />} />
          <Route path="feedback" element={<Feedback shop={shop} />} />
          <Route path="settings" element={<ShopSettings shop={shop} setShop={setShop} onSignOut={onSignOut} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="header-bar fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(([path, Icon, label]) => (
          <NavLink key={label} to={`/admin/${path}`} end={!path}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'c-gold' : 'c-muted'}`}>
            <Icon size={20} />{t(label)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function PageTitle({ title, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="serif c-title text-[36px] font-semibold leading-none">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
