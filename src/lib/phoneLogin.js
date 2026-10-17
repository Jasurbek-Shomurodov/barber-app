// Barber sign-in by phone + password. Supabase Auth keys password accounts by email, so each phone
// maps to a fixed internal address that is never shown and never receives mail. Shared by the
// browser (sign in) and api/auth/phone-signup.js (account creation), so both derive the same address.

/** International digits for a login phone: 9 local Uzbek digits get 998; '' when it cannot be a phone. */
export function loginPhoneDigits(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length === 9) return `998${d}`
  return d.length >= 10 && d.length <= 15 ? d : ''
}

export const phoneLoginEmail = (phone) => {
  const d = loginPhoneDigits(phone)
  return d ? `p${d}@phone.barber.local` : ''
}

export const PASSWORD_MIN = 6
