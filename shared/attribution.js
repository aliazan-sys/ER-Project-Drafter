// First-touch acquisition details attached to one funnel session. The Webflow
// host forwards its own landing context into the cross-origin drafter iframe;
// direct visits can be derived from the drafter URL and document.referrer.

const TEXT_LIMITS = {
  acquisitionSource: 255,
  utmSource: 255,
  utmMedium: 255,
  utmCampaign: 255,
  utmTerm: 255,
  utmContent: 255,
  referrerHost: 255,
  landingPath: 500,
  gclid: 255,
  fbclid: 255,
  msclkid: 255,
}

function cleanText(value, limit) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().slice(0, limit)
  return cleaned || null
}

function referrerHostname(referrer) {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

function normalizedHost(value) {
  return cleanText(value, TEXT_LIMITS.referrerHost)?.toLowerCase().replace(/^www\./, '') || null
}

export function isInternalAttributionHost(value) {
  const host = normalizedHost(value)
  if (!host) return false
  return (
    host === 'equalreach.io' ||
    host.endsWith('.equalreach.io') ||
    host === 'er-project-drafter.vercel.app' ||
    (host.startsWith('er-project-drafter-') && host.endsWith('.vercel.app'))
  )
}

export function normalizeAcquisitionSource(value) {
  const source = cleanText(value, TEXT_LIMITS.acquisitionSource)
  if (!source) return null
  const lower = source.toLowerCase().replace(/^www\./, '')
  if (isInternalAttributionHost(lower)) return 'direct'
  if (lower === 'gmail' || lower === 'gmail.com' || lower === 'mail.google.com' || lower === 'googlemail.com') {
    return 'gmail'
  }
  return source
}

export function normalizeAttribution(input) {
  const value = input && typeof input === 'object' ? input : {}
  const normalized = {}

  for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    normalized[key] = cleanText(value[key] ?? value[snakeKey], limit)
  }

  normalized.acquisitionSource = normalizeAcquisitionSource(normalized.acquisitionSource)
  if (isInternalAttributionHost(normalized.referrerHost)) normalized.referrerHost = null

  return normalized
}

export function attributionFromPage(href, referrer = '') {
  let url
  try {
    url = new URL(href)
  } catch {
    return normalizeAttribution({ acquisitionSource: 'direct' })
  }

  const params = url.searchParams
  const hasForwardedContext = params.has('er_source')
  const forwardedReferrer = cleanText(params.get('er_referrer_host'), TEXT_LIMITS.referrerHost)
  const referrerHost = forwardedReferrer || (hasForwardedContext ? null : referrerHostname(referrer))
  const utmSource = cleanText(params.get('utm_source'), TEXT_LIMITS.utmSource)
  const forwardedSource = cleanText(params.get('er_source'), TEXT_LIMITS.acquisitionSource)
  const landingPath =
    cleanText(params.get('er_landing_path'), TEXT_LIMITS.landingPath) ||
    cleanText(url.pathname, TEXT_LIMITS.landingPath)

  return normalizeAttribution({
    acquisitionSource: forwardedSource || utmSource || referrerHost || 'direct',
    utmSource,
    utmMedium: params.get('utm_medium'),
    utmCampaign: params.get('utm_campaign'),
    utmTerm: params.get('utm_term'),
    utmContent: params.get('utm_content'),
    referrerHost,
    landingPath,
    gclid: params.get('gclid'),
    fbclid: params.get('fbclid'),
    msclkid: params.get('msclkid'),
  })
}

export function formatAttributionLabel(input = {}) {
  const primary = normalizeAcquisitionSource(
    input.utm_source || input.utmSource ||
      input.acquisition_source || input.acquisitionSource ||
      input.referrer_host || input.referrerHost,
  )
  if (!primary) return ''
  const parts = [primary === 'direct' ? 'Direct' : primary === 'gmail' ? 'Gmail' : primary]
  const medium = input.utm_medium || input.utmMedium
  const campaign = input.utm_campaign || input.utmCampaign
  if (medium) parts.push(medium)
  if (campaign) parts.push(campaign)
  return `Source: ${parts.join(' · ')}`
}
