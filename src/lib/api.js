import { demoApi } from './demoApi.js'
import { createSupabaseApi } from './supabaseApi.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Supabase when configured, otherwise the in-browser demo backend. */
export const api = url && key ? createSupabaseApi(url, key) : demoApi
export const isDemo = api.mode === 'demo'
