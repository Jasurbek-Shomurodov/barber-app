import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import ShopPage from './pages/ShopPage.jsx'
import BookingPage from './pages/BookingPage.jsx'
import AdminApp from './pages/admin/AdminApp.jsx'
import OwnerApp from './pages/owner/OwnerApp.jsx'
import MyBookings from './pages/MyBookings.jsx'
import { isConfigured } from './lib/api.js'
import { useI18n } from './lib/i18n.jsx'

export default function App() {
  const { pathname } = useLocation()
  if (!isConfigured) return <NotConfigured />
  // Keyed by the top-level section so moving between pages animates in, but tabs inside /admin don't remount.
  const section = pathname.split('/')[1] || 'home'
  return (
    <div key={section} className="page-in">
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/owner" element={<OwnerApp />} />
      <Route path="/me" element={<MyBookings />} />
      <Route path="/b/:token" element={<BookingPage />} />
      <Route path="/:slug" element={<ShopPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </div>
  )
}

function NotConfigured() {
  const { t } = useI18n()
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="glass max-w-md rounded-[28px] p-6 text-center">
        <h1 className="serif c-title text-[28px] font-semibold">{t('notConfigured')}</h1>
        <p className="c-muted mt-2 text-[14px]">{t('notConfiguredHint')}</p>
      </div>
    </div>
  )
}
