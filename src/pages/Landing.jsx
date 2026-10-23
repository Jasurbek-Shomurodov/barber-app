import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, Link2, MessageSquareHeart } from 'lucide-react'
import { useI18n } from '../lib/i18n.jsx'
import { api } from '../lib/api.js'
import AuthDialog from '../components/AuthDialog.jsx'
import { LangSwitch, Logo, ThemeSwitch } from '../components/ui.jsx'
import hero640 from '../assets/hero-640.webp'
import hero1080 from '../assets/hero-1080.webp'
import hero1600 from '../assets/hero-1600.webp'
import hero2000 from '../assets/hero-2000.webp'
import heroLqip from '../assets/hero-lqip.webp'

// Hashed by Vite, so vercel.json can cache them forever; the tiny blurred preview is inlined.
const HERO_SRCSET = `${hero640} 640w, ${hero1080} 1080w, ${hero1600} 1600w, ${hero2000} 2000w`

export default function Landing() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  // Signed out: open the sign-in dialog over this page instead of leaving it.
  const openAdmin = (to, as) => async (e) => {
    e.preventDefault()
    const session = await api.getSession().catch(() => null)
    if (session) navigate(to)
    else setParams({ auth: 'in', ...(as ? { as } : {}) }, { state: { from: to } })
  }
  const features = [
    [Link2, 'feat1', 'feat1d', '/admin/settings'],
    [CalendarDays, 'feat2', 'feat2d', '/admin'],
    [MessageSquareHeart, 'feat3', 'feat3d', '/admin/clients'],
  ]
  return (
    <div className="min-h-dvh">
      <section className="hero relative isolate overflow-hidden text-center">
        <div aria-hidden="true" className="absolute inset-0 -z-10 scale-110 bg-cover bg-center blur-xl" style={{ backgroundImage: `url(${heroLqip})` }} />
        <img
          src={hero1080}
          srcSet={HERO_SRCSET}
          sizes="100vw"
          decoding="async"
          alt=""
          fetchpriority="high"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div className="hero-shade absolute inset-0 -z-10" />
        <div className="hero-top-blur absolute inset-x-0 top-0 -z-10 h-32" />
        <div className="hero-fade absolute inset-x-0 bottom-0 -z-10 h-56" />
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5"><Logo size={32} /><span className="serif text-[24px] font-semibold text-[#FFF8EE]">Barber</span></div>
          <div className="flex items-center gap-2"><LangSwitch onPhoto /><ThemeSwitch onPhoto /></div>
        </header>
        <div className="rise mx-auto max-w-6xl px-4 pb-44 pt-16 sm:pb-56 sm:pt-24">
          <h1 className="serif mx-auto max-w-3xl text-[44px] font-semibold leading-[1.02] text-[#FFF8EE] sm:text-[68px]">{t('heroTitle')}</h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] text-[#F1E4D2]">{t('heroSub')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/admin" onClick={openAdmin('/admin')} className="btn-primary rounded-full px-7 py-3.5 text-[16px] font-semibold">{t('barberArea')}</Link>
            <Link to="/me" onClick={openAdmin('/me', 'client')} className="switch-photo rounded-full px-7 py-3.5 text-[16px] font-semibold text-[#FFF8EE]">{t('myBookings')}</Link>
          </div>
        </div>
      </section>
      <main className="relative z-10 mx-auto -mt-32 max-w-6xl px-4 pb-16 sm:-mt-40">
        <section className="grid gap-4 md:grid-cols-3">
          {features.map(([Icon, title, desc, to]) => (
            <Link key={title} to={to} onClick={openAdmin(to)} className="glass hero-card group block rounded-[28px] p-6 transition hover:-translate-y-0.5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#C08447] to-[#7C4F22] text-[#FFF8EE]"><Icon size={20} /></span>
              <h2 className="serif c-title mt-4 flex items-center justify-between gap-2 text-[26px] font-semibold">
                {t(title)}
                <ArrowRight size={18} className="c-gold shrink-0 transition group-hover:translate-x-0.5" />
              </h2>
              <p className="c-body mt-1.5 text-[15px] leading-relaxed">{t(desc)}</p>
            </Link>
          ))}
        </section>
      </main>
      <AuthDialog />
    </div>
  )
}
