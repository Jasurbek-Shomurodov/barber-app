import { Link } from 'react-router-dom'
import { Check, Circle } from 'lucide-react'
import { useI18n } from '../lib/i18n.jsx'
import { checklistProgress } from '../lib/onboarding.js'

/** The approval checklist, computed by src/lib/onboarding.js. `links` maps an item key to a
 *  dashboard path so the barber can jump to the field; the admin's view passes none. */
export function Checklist({ shop, links = {}, compact = false }) {
  const { t, tf } = useI18n()
  const p = checklistProgress(shop)
  if (compact) {
    return (
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]" aria-label={t('checklistTitle')}>
        {p.items.map((i) => (
          <li key={i.key} className={`flex items-center gap-1 ${i.done ? 'c-muted' : 'c-title font-medium'}`}>
            {i.done ? <Check size={13} className="c-ok" /> : <Circle size={11} className="c-warn" />}{t(`check_${i.key}`)}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="c-title text-[15px] font-semibold">{t('checklistTitle')}</h3>
        <span className={`text-[13px] tabular-nums ${p.complete ? 'c-ok' : 'c-muted'}`}>{tf('checklistProgress', { done: p.done, total: p.total })}</span>
      </div>
      <ul className="space-y-1.5 text-[14px]">
        {p.items.map((i) => {
          const label = t(`check_${i.key}`)
          const to = !i.done && links[i.key]
          return (
            <li key={i.key} className="flex items-center gap-2">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${i.done ? 'bg-[var(--ok)] text-white' : 'soft c-muted'}`}>{i.done ? <Check size={12} /> : <Circle size={8} />}</span>
              {to ? <Link to={to} className="c-gold font-medium hover:underline">{label}</Link> : <span className={i.done ? 'c-muted line-through' : 'c-title'}>{label}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
