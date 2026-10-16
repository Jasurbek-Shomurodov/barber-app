import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import ShopPage from './pages/ShopPage.jsx'
import BookingPage from './pages/BookingPage.jsx'
import AdminApp from './pages/admin/AdminApp.jsx'

export default function App() {
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
