// The approval checklist. The platform admin sees it on /owner for every pending shop; the
// barber sees the same list on /admin as onboarding progress. Both sides compute it from the
// same fields so they never disagree.
//
// `shop` needs: owner_name (or name), phone, address, services (count) and telegram_linked.

export const CHECKLIST = ['owner_name', 'phone', 'address', 'services', 'telegram']

const hasText = (v) => typeof v === 'string' && v.trim().length > 1

export function shopChecklist(shop = {}) {
  const done = {
    owner_name: hasText(shop.owner_name) || hasText(shop.name),
    phone: hasText(shop.phone) || hasText(shop.owner_phone),
    address: hasText(shop.address),
    services: Number(shop.services) > 0,
    telegram: Boolean(shop.telegram_linked),
  }
  return CHECKLIST.map((key) => ({ key, done: Boolean(done[key]) }))
}

export function checklistProgress(shop) {
  const items = shopChecklist(shop)
  const done = items.filter((i) => i.done).length
  return { items, done, total: items.length, complete: done === items.length }
}
