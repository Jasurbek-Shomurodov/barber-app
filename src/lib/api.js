import { createSupabaseApi } from './supabaseApi.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False when the Supabase env vars are missing; App shows a setup message instead of the site. */
export const isConfigured = Boolean(url && key)
export const api = isConfigured ? createSupabaseApi(url, key) : null
