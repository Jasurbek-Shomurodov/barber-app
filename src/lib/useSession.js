import { useEffect, useState } from 'react'
import { api } from './api.js'

/** undefined while checking, null when signed out, otherwise the Supabase session. */
export function useSession() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    api.getSession().then(setSession).catch(() => setSession(null))
    return api.onAuthChange(setSession)
  }, [])
  return session
}
