import { Clock, Phone, Send } from 'lucide-react'
import { useI18n } from '../../lib/i18n.jsx'
import { Shimmer } from '../../components/ui.jsx'

/** Pieces shared by the /owner list and the /owner/:shopId page. */
export const STATUS_PILL = { pending: 'pill-warn', approved: 'pill-ok', suspended: 'pill-bad' }

export function OwnerShimmer() {
  return (
    <div className="space-y-4">
      <Shimmer className="h-10 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-[84px] rounded-[22px]" />)}</div>
      {[0, 1, 2].map((i) => <Shimmer key={i} className="h-[132px] w-full rounded-[24px]" />)}
    </div>
  )
}

/** Approve / suspend / reactivate for one shop; shared by the list card and the shop page. */
export function StatusActions({ shop, onStatus, busy, setBusy, setError }) {
  const { t } = useI18n()
  const act = async (status) => {
    setBusy(true); setError(null)
    try { await onStatus(shop, status) } catch (err) { setError(err) } finally { setBusy(false) }
  }
  return (
    <div className="flex gap-2">
      {shop.status !== 'approved' && (
        <button type="button" disabled={busy} onClick={() => act('approved')} className="btn-primary rounded-full px-5 py-2 text-[14px] font-semibold">
          {shop.status === 'pending' ? t('approve') : t('reactivate')}
        </button>
      )}
      {shop.status !== 'suspended' && (
        <button type="button" disabled={busy} onClick={() => act('suspended')} className="btn-ghost btn-danger rounded-full px-4 py-2 text-[14px] font-medium">{t('suspend')}</button>
      )}
    </div>
  )
}

export function OwnerContacts({ shop: s }) {
  const { t, dateTime } = useI18n()
  return (
    <div className="c-body flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
      {s.owner_name && <span className="c-title font-medium">{s.owner_name}</span>}
      {s.owner_phone && <a href={`tel:${s.owner_phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 hover:underline"><Phone size={14} className="c-gold" />{s.owner_phone}</a>}
      {s.owner_telegram && <a href={`https://t.me/${s.owner_telegram}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline"><Send size={14} className="c-gold" />@{s.owner_telegram}</a>}
      <span className="c-muted flex items-center gap-1.5"><Clock size={14} />{t('ownerJoined')} {dateTime(s.created_at)}</span>
    </div>
  )
}
