// Browser-side Telegram helpers: deep links to the bot and the Login Widget script.
// Verification always happens server-side (api/) or in Postgres, never here.

export const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT || ''
export const hasTelegram = () => Boolean(BOT_USERNAME)

export const bookingDeepLink = (token) => `https://t.me/${BOT_USERNAME}?start=b_${token}`
export const shopDeepLink = (code) => `https://t.me/${BOT_USERNAME}?start=s_${code}`
export const loginDeepLink = (code) => `https://t.me/${BOT_USERNAME}?start=l_${code}`

const randomToken = (bytes) => {
  const a = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
/** A fresh bot sign-in: `code` goes in the deep link, `secret` stays in this tab (api/auth/telegram-bot.js). */
export const newBotLogin = () => ({ code: randomToken(18), secret: randomToken(32) })

/** Mini App context: the page runs inside Telegram and initData identifies the user. */
export function webAppInitData() {
  const wa = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
  return wa?.initData || ''
}

/**
 * Mounts the Telegram Login Widget into `container` and resolves with the user payload on
 * login (https://core.telegram.org/widgets/login). `requestWrite` lets the bot message the user.
 */
export function mountLoginWidget(container, { onAuth, size = 'large', requestWrite = false, radius = 20 }) {
  if (!container || !BOT_USERNAME) return () => {}
  const name = `__tgAuth${Math.random().toString(36).slice(2)}`
  window[name] = (user) => onAuth(user)
  const script = document.createElement('script')
  script.src = 'https://telegram.org/js/telegram-widget.js?22'
  script.async = true
  script.setAttribute('data-telegram-login', BOT_USERNAME)
  script.setAttribute('data-size', size)
  script.setAttribute('data-radius', String(radius))
  script.setAttribute('data-userpic', 'false')
  script.setAttribute('data-onauth', `${name}(user)`)
  if (requestWrite) script.setAttribute('data-request-access', 'write')
  container.replaceChildren(script)
  return () => {
    delete window[name]
    container.replaceChildren()
  }
}
