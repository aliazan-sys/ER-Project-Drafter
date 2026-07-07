// Talks to our own Express proxy (server.js), never directly to Google.
// The API key lives on the server, so it is never exposed to the browser.

// Stable anonymous identity — generated once, persisted in localStorage.
// Lets the server filter history to this browser without requiring an account.
function getVisitorId() {
  const KEY = 'er_visitor_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json', 'X-Visitor-ID': getVisitorId() }
}

export async function generateDraft(answers) {
  const res = await fetch('/api/draft', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ answers }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data.draft
}

// One conversational turn. Returns { reply, readyToDraft }.
export async function sendChat(messages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ messages }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

// Drafts a full project request from a chatbot conversation transcript.
// Returns { draft, id } — id is the saved conversation row id.
export async function generateDraftFromChat(messages) {
  const res = await fetch('/api/draft', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ messages }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return { draft: data.draft, id: data.id }
}

// History: list conversations belonging to this visitor (newest first).
export async function listConversations() {
  const res = await fetch('/api/conversations', { headers: { 'X-Visitor-ID': getVisitorId() } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data.conversations || []
}

// History: fetch one conversation's transcript + draft.
export async function getConversation(id) {
  const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
    headers: { 'X-Visitor-ID': getVisitorId() },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data.conversation
}

// Sign-up handoff: create the user and save their drafted project in the
// EqualReach web app (Bubble backend workflow). Called directly from the
// browser — this is an external endpoint, not our proxy.
// Runtime endpoint on the version-test branch, where the workflow lives. No
// /initialize — that variant only responds while the Bubble editor is in
// "Detect data" mode and 404s ("not in initialization mode") for real runs.
const CREATE_USER_AND_DRAFT_URL =
  'https://admin-83903.bubbleapps.io/version-test/api/1.1/wf/webhook-create-user-and-draft-project'

// The Bubble workflow types several params as Option Sets / Date / number, so
// the free-text draft values must be coerced to match before sending.
const COMPLEXITY_MAP = { Large: 'large', Medium: 'medium', Small: 'small' }
const EXPERIENCE_MAP = { Entry: 'entry', Intermediate: 'intermediate', Expert: 'expert' }
const PRICING_MAP = {
  'Per Unit': 'Per Unit',
  'Monthly Rate': 'Monthly Rate',
  'Fixed Price': 'Fixed Price',
  'Not Sure': 'Not Sure',
}

function toOption(value, map) {
  if (!value) return null
  return map[value] || String(value).trim().toLowerCase().replace(/\s+/g, '_')
}

// "£4,500 - £5,500" -> 4500 ; 5000 -> 5000 ; "" -> null
function parseCost(value) {
  if (typeof value === 'number') return value
  if (!value) return null
  const m = String(value).replace(/,/g, '').match(/\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

// Turns fuzzy human dates ("Mid-July 2026", "End of September 2026") into an
// ISO string Bubble can read as a Date. Returns null if it can't be parsed.
function parseFuzzyDate(value) {
  if (!value) return null
  const s = String(value).trim()
  const lower = s.toLowerCase()

  // Match a month + year first, so fuzzy modifiers ("Mid", "End of") are
  // honoured. Longer names before abbreviations to avoid partial matches.
  const months = [
    ['january', 0], ['february', 1], ['march', 2], ['april', 3], ['may', 4],
    ['june', 5], ['july', 6], ['august', 7], ['september', 8], ['october', 9],
    ['november', 10], ['december', 11], ['sept', 8], ['jan', 0], ['feb', 1],
    ['mar', 2], ['apr', 3], ['jun', 5], ['jul', 6], ['aug', 7], ['sep', 8],
    ['oct', 9], ['nov', 10], ['dec', 11],
  ]
  const found = months.find(([name]) => new RegExp(`\\b${name}`).test(lower))
  const year = lower.match(/\b(20\d{2})\b/)

  if (found && year) {
    const month = found[1]
    const y = Number(year[1])
    // An explicit day number (1–31) that isn't part of the year wins.
    const dayToken = lower.replace(String(year[1]), '').match(/\b([0-3]?\d)(?:st|nd|rd|th)?\b/)
    let day
    if (dayToken) day = Math.min(31, Number(dayToken[1]))
    else if (/\bearly\b|\bbeginning\b|\bstart\b/.test(lower)) day = 1
    else if (/\blate\b/.test(lower)) day = 25
    else if (/\bend\b/.test(lower)) day = new Date(y, month + 1, 0).getDate()
    else day = 15 // default / "mid"
    return new Date(Date.UTC(y, month, day)).toISOString()
  }

  // Fall back to native parsing for real formatted dates (ISO, "2026-09-28").
  const direct = new Date(s)
  return Number.isNaN(direct.getTime()) ? null : direct.toISOString()
}

// Coerce the editable form draft into the shape/types the Bubble workflow wants
// (nested), so Option Sets, Date and number params line up.
export function buildSubmissionPayload(email, draft, contact = {}) {
  const d = draft || {}
  const scope = d.scope || {}
  const budget = d.budget || {}
  return {
    email,
    organizationName: contact.organizationName || '',
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    draft: {
      ...d,
      levelOfExperience: toOption(d.levelOfExperience, EXPERIENCE_MAP),
      scope: {
        ...scope,
        complexity: toOption(scope.complexity, COMPLEXITY_MAP),
        startDate: parseFuzzyDate(scope.startDate),
        completionDate: parseFuzzyDate(scope.completionDate),
      },
      budget: {
        ...budget,
        pricingType: toOption(budget.pricingType, PRICING_MAP),
        currency: budget.currency ? String(budget.currency).toLowerCase() : null,
        estimatedCostFrom: parseCost(budget.estimatedCostFrom),
        estimatedCostTo: parseCost(budget.estimatedCostTo),
      },
    },
  }
}

export async function submitDraftSignup(email, draft, contact = {}) {
  const res = await fetch(CREATE_USER_AND_DRAFT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSubmissionPayload(email, draft, contact)),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`)
  }
  return data
}

export async function checkHealth() {
  try {
    const res = await fetch('/api/health')
    return await res.json()
  } catch {
    return { ok: false, keyConfigured: false }
  }
}
