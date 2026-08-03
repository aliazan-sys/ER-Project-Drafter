// Organization-profile pick-lists, shared by the client (the Review step's
// Type/Size dropdowns) and the server (so the AI matches these exact values).
// Type and Size are fixed lists; Industry is free text; Location is a
// geographic address, autocompleted from Google Places (see shared/places.js).
// IMPORTANT: every string below must match the DISPLAY value of its Bubble
// Option Set character for character — ORG_TYPES against CLIENT_ORG_TYPE and
// ORG_SIZES against CLIENT_SIZE. The workflow resolves these by display text,
// so a value that is merely close ("NGO" for "NGO or Charity") arrives
// unmatched and the field silently fails to map. Check both lists against
// Bubble whenever either side changes.
export const ORG_TYPES = [
  'Startup',
  'Small-Medium Enterprise (SME)',
  'Enterprise',
  'Solo Business',
  'NGO or Charity',
  'INGO & Government',
]

export const ORG_SIZES = [
  'Less than 10 employees',
  'Small, 10-20 employees',
  'Medium 20-50 employees',
  'Large +50 employees',
]

// Exact values expected by the Bubble webhook for CLIENT_ORG_TYPE and
// CLIENT_SIZE. These are explicit mappings supplied from Bubble—not generated
// by lowercasing or replacing spaces/punctuation.
export const BUBBLE_ORG_TYPE_VALUES = {
  Startup: 'startup',
  'Small-Medium Enterprise (SME)': 'sme',
  Enterprise: 'enterprise',
  'Solo Business': 'solo',
  'NGO or Charity': 'ngo',
  'INGO & Government': 'ingo',
}

export const BUBBLE_ORG_SIZE_VALUES = {
  'Less than 10 employees': 'less_than_10',
  'Small, 10-20 employees': 'small',
  'Medium 20-50 employees': 'medium',
  'Large +50 employees': 'large',
}

// Values this app used to offer that are still sitting in saved drafts. Mapped
// forward so reopening an old draft keeps its answer instead of silently
// blanking the chip.
const ORG_TYPE_ALIASES = {
  NGO: 'NGO or Charity',
}

// The only way a type/size should ever be read. Returns the exact Option Set
// display value, or '' — never anything Bubble cannot resolve.
export const canonicalOrgType = (value) => {
  const v = String(value ?? '').trim()
  const aliased = ORG_TYPE_ALIASES[v] || v
  return ORG_TYPES.includes(aliased) ? aliased : ''
}

export const canonicalOrgSize = (value) => {
  const v = String(value ?? '').trim()
  return ORG_SIZES.includes(v) ? v : ''
}
