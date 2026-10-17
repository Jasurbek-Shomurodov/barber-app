// Which language a first-time visitor sees. A choice the visitor made (saved) always wins;
// otherwise the platform's language: Telegram's (inside the Mini App), then the browser's
// preference list in order. Anything we don't support falls back to Russian.
export const SUPPORTED = ['ru', 'uz', 'en']
export const FALLBACK = 'ru'

export function normalize(code) {
  const base = String(code || '').toLowerCase().split(/[-_]/)[0]
  return SUPPORTED.includes(base) ? base : null
}

export function detectLang({ saved, telegram, browser = [] } = {}) {
  if (SUPPORTED.includes(saved)) return saved
  for (const code of [telegram, ...browser]) {
    const hit = normalize(code)
    if (hit) return hit
  }
  return FALLBACK
}

/** Reads the platform in the browser; safe when storage or Telegram is unavailable. */
export function platformLang() {
  let saved = null
  try { saved = localStorage.getItem('nb-lang') } catch { /* private mode */ }
  const telegram = typeof window !== 'undefined' ? window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code : null
  const browser = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
  return detectLang({ saved, telegram, browser })
}
