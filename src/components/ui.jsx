import { useEffect, useId, useRef, useState } from 'react'
import { Monitor, Moon, Star, Sun, X } from 'lucide-react'
import { LANGS, useI18n } from '../lib/i18n.jsx'
import { hasTelegram, mountLoginWidget } from '../lib/telegram.js'

export function Shimmer({ className = '', style }) {
  return <div className={`shimmer ${className}`} style={style} aria-hidden="true" />
}

export function Logo({ size = 34 }) {
  const gid = `nb-logo-${useId().replace(/:/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C08447" />
          <stop offset="1" stopColor="#7C4F22" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${gid})`} />
      <g fill="none" stroke="#FFF8EE" strokeWidth="4" strokeLinecap="round">
        <circle cx="22" cy="44" r="7" />
        <circle cx="42" cy="44" r="7" />
        <path d="M26 38 44 14M38 38 20 14" />
      </g>
    </svg>
  )
}

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <div className="soft flex rounded-full p-0.5 text-[13px] font-medium">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`rounded-full px-2.5 py-1 transition ${lang === l.code ? 'bg-[var(--soft-strong)] c-title shadow-sm' : 'c-muted'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

const THEMES = [
  ['system', Monitor, 'themeSystem'],
  ['light', Sun, 'themeLight'],
  ['dark', Moon, 'themeDark'],
]

// System by default; light/dark pin the theme and persist in localStorage (read in index.html).
export function ThemeSwitch() {
  const { t } = useI18n()
  const [mode, setMode] = useState(() => document.documentElement.dataset.theme || 'system')
  const choose = (next) => {
    const root = document.documentElement
    if (next === 'system') delete root.dataset.theme
    else root.dataset.theme = next
    try {
      if (next === 'system') localStorage.removeItem('nb-theme')
      else localStorage.setItem('nb-theme', next)
    } catch { /* ignore */ }
    setMode(next)
  }
  return (
    <div className="soft flex rounded-full p-0.5" role="group" aria-label={t('theme')}>
      {THEMES.map(([code, Icon, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-pressed={mode === code}
          aria-label={t(label)}
          title={t(label)}
          className={`grid h-7 w-7 place-items-center rounded-full transition ${mode === code ? 'bg-[var(--soft-strong)] c-title shadow-sm' : 'c-muted'}`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

export function Stars({ value, size = 14, onChange, label }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={label || `${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = shown >= n ? 1 : shown >= n - 0.5 ? 0.5 : 0
        const icon = (
          <span className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 c-muted opacity-40" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} fill="#D19A55" stroke="#C08447" />
            </span>
          </span>
        )
        if (!onChange) return <span key={n}>{icon}</span>
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            className="p-1 transition-transform active:scale-90"
          >
            {icon}
          </button>
        )
      })}
    </div>
  )
}

export function Sheet({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="sheet-backdrop absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`glass rise relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] p-5 sm:rounded-[28px] sm:p-6 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        style={{ background: 'var(--page)' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="serif c-title text-[26px] font-semibold leading-tight">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost grid h-9 w-9 shrink-0 place-items-center rounded-full" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="c-muted mb-1.5 block text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="c-muted mt-1 block text-[12px]">{hint}</span>}
    </label>
  )
}

export function ErrorNote({ error, onRetry }) {
  const { t, errorText } = useI18n()
  if (!error) return null
  return (
    <div className="pill-bad flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[14px]" role="alert">
      <span>{typeof error === 'string' ? t(error) : error.code === 'unknown_error' && error.message && error.message !== 'unknown_error' ? error.message : errorText(error)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">{t('retry')}</button>
      )}
    </div>
  )
}

export function StatusPill({ status }) {
  const { t } = useI18n()
  const cls = { booked: 'pill-warn', done: 'pill-ok', no_show: 'pill-bad', cancelled: 'pill-muted', blocked: 'pill-muted' }[status] || 'pill-muted'
  return <span className={`${cls} inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold`}>{t(`status_${status}`)}</span>
}

/** Telegram Login Widget. Renders nothing when VITE_TELEGRAM_BOT is unset. */
export function TelegramLoginButton({ onAuth, requestWrite = false }) {
  const ref = useRef(null)
  useEffect(() => mountLoginWidget(ref.current, { onAuth, requestWrite }), [onAuth, requestWrite])
  if (!hasTelegram()) return null
  return <div ref={ref} className="flex min-h-[40px] justify-center" />
}
