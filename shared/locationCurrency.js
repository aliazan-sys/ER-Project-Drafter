// Currency is determined from the submitter's location, not inferred from the
// project wording. The requested EU rule applies to every EU member state,
// including members whose domestic currency is not the euro.
const UK_NAMES = ['united kingdom', 'uk', 'gb', 'great britain', 'england', 'scotland', 'wales', 'northern ireland']
const US_NAMES = ['united states', 'united states of america', 'usa', 'us']
const EU_NAMES = [
  'austria', 'at', 'belgium', 'be', 'bulgaria', 'bg', 'croatia', 'hr',
  'cyprus', 'cy', 'czechia', 'czech republic', 'cz', 'denmark', 'dk',
  'estonia', 'ee', 'finland', 'fi', 'france', 'fr', 'germany', 'de',
  'greece', 'gr', 'hungary', 'hu', 'ireland', 'ie', 'italy', 'it',
  'latvia', 'lv', 'lithuania', 'lt', 'luxembourg', 'lu', 'malta', 'mt',
  'netherlands', 'the netherlands', 'nl', 'poland', 'pl', 'portugal', 'pt',
  'romania', 'ro', 'slovakia', 'sk', 'slovenia', 'si', 'spain', 'es',
  'sweden', 'se',
]

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()

const matchesPlace = (location, names) => {
  const normalized = normalize(location)
  if (!normalized) return false
  const parts = normalized.split(',').map((part) => part.trim())
  return names.some((name) => parts.includes(name) || normalized === name)
}

export function currencyForLocation(location) {
  if (matchesPlace(location, UK_NAMES)) return 'GBP'
  if (matchesPlace(location, US_NAMES)) return 'USD'
  if (matchesPlace(location, EU_NAMES)) return 'EUR'
  return 'USD'
}
