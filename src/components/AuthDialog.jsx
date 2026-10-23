import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { hasTelegram, loginDeepLink, newBotLogin } from '../lib/telegram.js'
import { PASSWORD_MIN } from '../lib/phoneLogin.js'
import { ErrorNote, Field, Sheet } from './ui.jsx'

/**
 * Sign-in / sign-up dialog for clients and barbers, opened by ?auth=in or ?auth=up (plus
 * &as=client) on whatever page renders it (the landing page; /admin, /owner and /me redirect
 * here when signed out). The URL holds it so back closes it. The role only picks where to go
 * next: clients to /me, barbers to /admin, the platform admin to /owner.
 */
export default function AuthDialog() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const mode = params.get('auth')
  const as = params.get('as') === 'client' ? 'client' : 'barber'
  const close = useCallback(() => setParams({}, { replace: true }), [setParams])
  const onSession = useCallback(async () => {
    let to = location.state?.from
    if (!to) to = as === 'client' ? '/me' : (await api.isPlatformAdmin().catch(() => false)) ? '/owner' : '/admin'
    navigate(to, { replace: true })
  }, [navigate, location.state, as])
  const open = mode === 'in' || mode === 'up'
  const go = (next) => setParams({ auth: next.mode, ...(next.as === 'client' ? { as: 'client' } : {}) }, { replace: true, state: location.state })

  return (
    <Sheet open={open} onClose={close} title={mode === 'up' ? t('signUp') : as === 'client' ? t('signIn') : t('barberLogin')}>
      <div className="space-y-3">
        <div className="soft flex rounded-full p-0.5 text-[14px] font-medium" role="group" aria-label={t('accountType')}>
          {['client', 'barber'].map((r) => (
            <button key={r} type="button" aria-pressed={as === r} onClick={() => go({ mode, as: r })}
              className={`flex-1 rounded-full py-2 transition ${as === r ? 'bg-[var(--soft-strong)] c-title shadow-sm' : 'c-muted'}`}>{t(r === 'client' ? 'asClient' : 'asBarber')}</button>
          ))}
        </div>
        <p className="c-muted text-[13px]">{t(as === 'client' ? 'clientAuthHint' : mode === 'up' ? 'barberSignupHint' : 'barberAuthHint')}</p>
        <PhoneAuthForm key={mode} mode={mode} onSession={onSession} />
        <button type="button" onClick={() => go({ mode: mode === 'up' ? 'in' : 'up', as })} className="c-gold w-full text-center text-[14px] font-medium hover:underline">
          {mode === 'up' ? t('haveAccount') : t('noAccount')}
        </button>
      </div>
    </Sheet>
  )
}

/** Telegram button plus the phone + password form; mode 'up' adds the name and creates the account. */
function PhoneAuthForm({ mode, onSession }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      onSession(mode === 'in' ? await api.signInWithPhone(phone, password) : await api.signUpWithPhone(name, phone, password))
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {hasTelegram() && <>
        <TelegramBotLogin onSession={onSession} />
        <div className="c-muted flex items-center gap-3 text-[12px]"><span className="b-line h-px flex-1 border-t" />{t('orPhone')}<span className="b-line h-px flex-1 border-t" /></div>
      </>}
      {mode === 'up' && <Field label={t('name')}><input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required autoFocus /></Field>}
      <Field label={t('phone')}><input className="field" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+998 90 123 45 67" required /></Field>
      <Field label={t('password')}><input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={PASSWORD_MIN} required /></Field>
      {error && <ErrorNote error={error} />}
      <button type="submit" disabled={busy} className="btn-primary w-full rounded-full py-3 font-semibold">{mode === 'in' ? t('signIn') : t('signUp')}</button>
    </form>
  )
}

const BOT_POLL_MS = 2000

/**
 * Sign-in through the bot: the link opens Telegram with a one-time code, the barber taps Confirm
 * there, and this tab polls until api/auth/telegram-bot.js hands over the session.
 * A plain link (not a popup) so phones open the Telegram app directly.
 */
function TelegramBotLogin({ onSession }) {
  const { t } = useI18n()
  const [login, setLogin] = useState(newBotLogin)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState(null)

  const restart = useCallback((err) => {
    setError(err); setWaiting(false); setLogin(newBotLogin())
  }, [])

  async function open() {
    setError(null)
    if (waiting) return // the request is registered; this click just reopens the bot
    setWaiting(true)
    try { await api.startTelegramBotLogin(login.code, login.secret) } catch (err) { restart(err) }
  }

  useEffect(() => {
    if (!waiting) return undefined
    let stopped = false
    let inFlight = false
    const poll = async () => {
      if (stopped || inFlight) return
      inFlight = true
      try {
        const session = await api.pollTelegramBotLogin(login.code, login.secret)
        if (session && !stopped) { stopped = true; onSession(session) }
      } catch (err) {
        if (!stopped) { stopped = true; restart(err) }
      } finally { inFlight = false }
    }
    const timer = setInterval(poll, BOT_POLL_MS)
    // Coming back from the Telegram app should not wait for the next tick.
    const onVisible = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [waiting, login, onSession, restart])

  return (
    <div className="space-y-2">
      <a href={loginDeepLink(login.code)} target="_blank" rel="noopener noreferrer" onClick={open}
        className="tg-button flex w-full items-center justify-center gap-2 rounded-full py-3 font-semibold">
        <Send size={18} />{waiting ? t('tgOpenAgain') : t('loginWithTelegram')}
      </a>
      {waiting && <p className="soft c-muted rounded-2xl px-4 py-3 text-center text-[14px]" role="status">{t('tgWaitConfirm')}</p>}
      {error && <ErrorNote error={error} />}
    </div>
  )
}
