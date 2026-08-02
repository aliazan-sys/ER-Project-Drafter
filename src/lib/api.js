// Talks to our own Express proxy (server.js), never directly to Google.
// The API key lives on the server, so it is never exposed to the browser.

import { CATEGORIES } from '../../shared/categories.js'

// Stable anonymous identity — generated once, persisted in localStorage.
// Lets the server filter history to this browser without requiring an account.
export function getVisitorId() {
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

// Funnel numbers: one row of totals for the drafter funnel. Counts come back
// from Postgres as strings (bigint), so they are coerced here — every caller
// wants numbers.
export async function getFunnelSummary() {
  const res = await fetch('/api/funnel')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  const s = data.summary || {}
  return {
    conversationsStarted: Number(s.conversations_started || 0),
    leftInConversation: Number(s.left_in_conversation || 0),
    leftInReview: Number(s.left_in_review || 0),
    leftInSignup: Number(s.left_in_signup || 0),
    completed: Number(s.completed || 0),
    uniqueVisitors: Number(s.unique_visitors || 0),
  }
}

// Geographic autocomplete for the organisation's Location. Goes through our
// own proxy (/api/places), so the Google Maps key stays server-side.
//
// Returns { suggestions, configured }. `configured: false` means no Maps key is
// set on the server — the caller should fall back to plain text rather than
// showing an error, and stop asking. Anything that actually fails resolves the
// same way: an address field that still accepts typing beats one that shouts.
export const MIN_PLACE_QUERY = 3

export async function fetchPlaceSuggestions(query, { signal } = {}) {
  const q = String(query ?? '').trim()
  if (q.length < MIN_PLACE_QUERY) return { suggestions: [], configured: true }
  try {
    const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 400/403 is a key or project problem (invalid key, Places API not
      // enabled) — permanent until someone fixes the config, so report it as
      // "not configured" and let the caller stop asking. Other failures are
      // treated as transient.
      const permanent = res.status === 400 || res.status === 403
      return { suggestions: [], configured: !permanent, error: data.error || 'Lookup failed' }
    }
    return { suggestions: data.suggestions || [], configured: data.configured !== false }
  } catch (err) {
    // An aborted request is a superseded keystroke, not a failure — let the
    // caller ignore it rather than clearing the menu it is about to refill.
    if (err?.name === 'AbortError') throw err
    return { suggestions: [], configured: true, error: 'Lookup failed' }
  }
}

// Sign-up handoff: create the user and save their drafted project in the
// EqualReach web app (Bubble backend workflow). Called directly from the
// browser — this is an external endpoint, not our proxy.
const CREATE_USER_AND_DRAFT_URL =
  'https://admin-83903.bubbleapps.io/version-93726/api/1.1/wf/webhook-create-user-and-draft-project'

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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Resolves fuzzy human dates ("Mid-July 2026", "End of September 2026") — and
// machine ones ("2026-09-28") — to {y, m, d}, m being 0-based. Null if unparsable.
// The single source of truth for reading a date: everything below builds on it.
function fuzzyDateParts(value) {
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
    return { y, m: month, d: day }
  }

  // Fall back to native parsing for real formatted dates (ISO, "2026-09-28").
  const direct = new Date(s)
  if (Number.isNaN(direct.getTime())) return null
  // Read back in UTC: an ISO date string parses to UTC midnight, and local
  // getters would roll it to the previous day west of Greenwich.
  return { y: direct.getUTCFullYear(), m: direct.getUTCMonth(), d: direct.getUTCDate() }
}

// ISO string Bubble can read as a Date. Returns null if it can't be parsed.
function parseFuzzyDate(value) {
  const p = fuzzyDateParts(value)
  return p ? new Date(Date.UTC(p.y, p.m, p.d)).toISOString() : null
}

// "yyyy-mm-dd" — the only shape <input type="date"> accepts as a value.
export function toDateInputValue(value) {
  const p = fuzzyDateParts(value)
  if (!p) return ''
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

// The house display format: "12 Aug, 2026".
export function formatDisplayDate(value) {
  const p = fuzzyDateParts(value)
  return p ? `${p.d} ${MONTH_ABBR[p.m]}, ${p.y}` : ''
}

// Where the user lands after signing up. The token we mint below is handed to
// the web app so it can pick up the draft the webhook just created.
// /redirect, not /login: the account already exists by this point, so the web
// app resolves the token and drops them straight in rather than asking them to
// authenticate against the credentials they just set.
// `ai_redirect=yes` marks this as an arrival from the AI drafter, so the web
// app sends them straight in instead of bouncing them to /login. No token
// rides along — the app resolves the draft itself.
export const REDIRECT_URL = 'https://app.equalreach.io/version-93726/redirect?ai_redirect=yes'

// Where an existing account is sent instead: they authenticate normally.
export const LOGIN_URL = 'https://app.equalreach.io/version-93726/login'

// 32 hex chars of CSPRNG randomness, sent to the workflow as
// `ai_drafter_token`. No longer echoed in the redirect URL — the web app is
// expected to resolve the draft itself.
function generateDrafterToken() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Coerce the editable form draft into the shape/types the Bubble workflow wants
// (nested), so Option Sets, Date and number params line up.
export function buildSubmissionPayload(email, draft, contact = {}, aiDrafterToken = '') {
  const d = draft || {}
  const scope = d.scope || {}
  const budget = d.budget || {}
  // Internal bookkeeping for the Location field's "must be a real address"
  // check — it has done its job by now and is not part of the brief.
  const { locationVerified, ...orgProfile } = d.orgProfile || {}
  return {
    email,
    ai_drafter_token: aiDrafterToken,
    // Every draft that reaches this endpoint came out of the AI drafter, so this
    // is constant here. It exists so the web app can tell these apart from
    // projects a user typed in by hand.
    created_by_ai: true,
    organizationName: contact.organizationName || '',
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    // Sent top-level, deliberately NOT inside `draft`: drafts are persisted to
    // our own history store and echoed back to the browser, and a credential
    // must not ride along into either.
    password: contact.password || '',
    draft: {
      ...d,
      orgProfile,
      // Enforced again at the boundary, not just in the form: whatever the
      // model or a stored draft supplied, only predefined categories leave the
      // browser. A category the user could not have selected must never reach
      // the EqualReach app.
      categories: (d.categories || []).filter((c) => CATEGORIES.includes(c)),
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

// `keepalive` caps the body at 64 KiB. A draft is a few KB, so this is headroom
// rather than a real limit — but exceeding it makes fetch reject outright, so
// fall back to a normal request rather than losing the submission entirely.
const KEEPALIVE_MAX_BYTES = 64 * 1024

// The two ways a signup can end, as far as the redirect is concerned.
export const SIGNUP_DUPLICATE = 'duplicate' // account exists -> send to login
export const SIGNUP_PROCEED = 'proceed'     // everything else -> send to redirect

// How long we are willing to wait to learn whether the email was a duplicate.
// The workflow is slow (a bare 404 from that app measured ~4s), so this is a
// ceiling, not an expected wait: past it we stop listening and let them
// through. We never abort the request itself — see below.
const DUPLICATE_CHECK_TIMEOUT_MS = 8000

// Bubble nests workflow errors as { statusCode, body: { status, message } },
// so the message is NOT at the top level. Read both shapes.
function errorMessageOf(data) {
  return String(data?.body?.message || data?.message || data?.error || '')
}

// Duplicate-email detection is phrase-matched because the workflow reports it
// as a plain message, not a distinguishable code. Kept deliberately broad —
// Bubble's signup action has worded this several ways across versions. If the
// workflow is ever changed to return a machine-readable flag, prefer that.
function isDuplicateEmail(data) {
  const msg = errorMessageOf(data).toLowerCase()
  if (!msg) return false
  return (
    /already\s+(in\s+use|used|exists|taken|registered|have)/.test(msg) ||
    /(email|account|user)\s+.*already/.test(msg) ||
    /duplicate/.test(msg) ||
    /not\s+unique/.test(msg)
  )
}

function after(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// Dispatches the signup and reports back ONLY whether the email was already
// taken. Returns synchronously with the token plus an `outcome` promise the
// caller awaits just long enough to pick a destination.
//
// Everything that is not a confirmed duplicate resolves to SIGNUP_PROCEED —
// a network failure, an edge timeout, an unrelated workflow error. This is
// deliberate: the duplicate check is the only gate, so anything ambiguous
// lets the user through rather than stranding them on a login page for an
// account that may not exist.
//
// `keepalive` matters here: on the timeout path we redirect while the request
// is still in flight, and without it the browser may cancel it on navigation.
export function submitDraftSignup(email, draft, contact = {}) {
  const aiDrafterToken = generateDrafterToken()
  const body = JSON.stringify(buildSubmissionPayload(email, draft, contact, aiDrafterToken))

  const request = fetch(CREATE_USER_AND_DRAFT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: new Blob([body]).size <= KEEPALIVE_MAX_BYTES,
  })
    .then(async (res) => {
      if (res.ok) return SIGNUP_PROCEED
      const data = await res.json().catch(() => ({}))
      return isDuplicateEmail(data) ? SIGNUP_DUPLICATE : SIGNUP_PROCEED
    })
    .catch(() => SIGNUP_PROCEED)

  // Race rather than abort: letting the timer win stops us WAITING, but the
  // request keeps running so a slow workflow still creates the account.
  const outcome = Promise.race([request, after(DUPLICATE_CHECK_TIMEOUT_MS, SIGNUP_PROCEED)])

  // The token is still sent to the workflow in the payload, but the caller has
  // no use for it now that the redirect carries no query string.
  return { outcome }
}

export async function checkHealth() {
  try {
    const res = await fetch('/api/health')
    return await res.json()
  } catch {
    return { ok: false, keyConfigured: false }
  }
}
