import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { LangSwitch, Logo, ThemeSwitch } from './ui.jsx'

/** Page chrome for signed-in areas outside the barber dashboard: /owner and /me. */
export default function AccountShell({ title, links, children, wide = false }) {
  const { t } = useI18n()
  const width = wide ? 'max-w-6xl' : 'max-w-2xl'
  return (
    <div className="min-h-dvh">
      <header className="header-bar sticky top-0 z-30">
        <div className={`mx-auto flex h-14 ${width} items-center justify-between gap-3 px-4`}>
          <Link to="/" className="flex min-w-0 items-center gap-2.5"><Logo size={28} /><span className="serif c-title truncate text-[21px] font-semibold">Barber</span></Link>
          <div className="flex items-center gap-1.5">
            {links}
            <LangSwitch />
            <span className="hidden sm:block"><ThemeSwitch /></span>
            <button type="button" onClick={() => api.signOut().then(() => window.location.assign('/'))} className="btn-ghost grid h-9 w-9 place-items-center rounded-full" aria-label={t('signOut')} title={t('signOut')}><LogOut size={16} /></button>
          </div>
        </div>
      </header>
      <main className={`mx-auto ${width} px-4 pb-16 pt-6`}>
        {title && <h1 className="serif c-title mb-5 text-[36px] font-semibold leading-none">{title}</h1>}
        {children}
      </main>
    </div>
  )
}
