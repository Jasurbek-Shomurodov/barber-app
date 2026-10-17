import { Link } from 'react-router-dom'
import { CalendarDays, Link2, MessageSquareHeart } from 'lucide-react'
import { useI18n } from '../lib/i18n.jsx'
import { LangSwitch, Logo, ThemeToggle } from '../components/ui.jsx'

export default function Landing() {
  const { t } = useI18n()
  const features = [
    [Link2, 'feat1', 'feat1d'],
    [CalendarDays, 'feat2', 'feat2d'],
    [MessageSquareHeart, 'feat3', 'feat3d'],
  ]
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2.5"><Logo size={32} /><span className="serif c-title text-[24px] font-semibold">Barber</span></div>
        <div className="flex items-center gap-2"><LangSwitch /><ThemeToggle /></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="rise py-12 text-center sm:py-20">
          <h1 className="serif c-title mx-auto max-w-3xl text-[44px] font-semibold leading-[1.02] sm:text-[68px]">{t('heroTitle')}</h1>
          <p className="c-body mx-auto mt-5 max-w-xl text-[17px]">{t('heroSub')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/demo" className="btn-primary rounded-full px-7 py-3.5 text-[16px] font-semibold">{t('tryDemo')}</Link>
            <Link to="/admin" className="btn-ghost rounded-full px-7 py-3.5 text-[16px] font-semibold">{t('barberArea')}</Link>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {features.map(([Icon, title, desc]) => (
            <div key={title} className="glass rounded-[28px] p-6">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#C08447] to-[#7C4F22] text-[#FFF8EE]"><Icon size={20} /></span>
              <h2 className="serif c-title mt-4 text-[26px] font-semibold">{t(title)}</h2>
              <p className="c-body mt-1.5 text-[15px] leading-relaxed">{t(desc)}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
