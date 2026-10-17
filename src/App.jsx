import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import ShopPage from './pages/ShopPage.jsx'
import BookingPage from './pages/BookingPage.jsx'
import AdminApp from './pages/admin/AdminApp.jsx'
import { isConfigured } from './lib/api.js'
import { useI18n } from './lib/i18n.jsx'

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/b/:token" element={<BookingPage />} />
      <Route path="/:slug" element={<ShopPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
