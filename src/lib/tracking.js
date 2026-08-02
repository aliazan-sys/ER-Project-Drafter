// Funnel tracking for the AI drafter — how many conversations start, and how
// far each one gets. Reports to our own /api/track, which writes one row per
// conversation to Supabase (see shared/store.js).
//
// Two rules keep this honest:
//  - Entirely fire-and-forget. Nothing here is awaited and nothing throws, so
//    a tracking outage can never slow down or break the drafter.
//  - Only the FURTHEST stage matters. The server keeps the highest stage it
//    has seen for a session, so callers can report freely without worrying
//    about order, repeats, or the user navigating backwards.

import { getVisitorId } from './api.js'

const SESSION_KEY = 'er_funnel_session'
const MODE_KEY = 'er_funnel_mode'

// sessionStorage scopes a conversation to the tab and survives a reload. It
// can throw in a cross-site iframe with storage blocked (the Webflow embed on
// a locked-down browser), so an in-memory copy backs it up — tracking then
// works for the life of the page instead of not at all.
let memory = { session: null, mode: null }

function read(key, slot) {
  try {
    return sessionStorage.getItem(key) ?? memory[slot]
  } catch {
    return memory[slot]
  }
}

function write(key, slot, value) {
  memory[slot] = value
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // Storage unavailable — the in-memory copy above is the fallback.
  }
}

// Starts tracking a conversation, if one isn't already being tracked. Safe to
// call on every message: only the first call in a conversation creates a
// session, so callers don't need to detect "is this the first message?".
// `mode` records which experience it came from: 'draft' | 'chat' | 'guided'.
export function startConversation(mode = 'chat') {
  if (read(SESSION_KEY, 'session')) return
  write(MODE_KEY, 'mode', mode)
  write(SESSION_KEY, 'session', newSessionId())
  trackStage('conversation')
}

// Ends the current conversation so the next one is counted separately. Called
// when the user starts a new chat — NOT on submit, since a completed session
// is finished anyway and clearing it would only risk re-counting.
export function resetConversation() {
  write(SESSION_KEY, 'session', null)
  write(MODE_KEY, 'mode', null)
}

// Reports that the conversation reached `stage`. A no-op when no conversation
// is being tracked — which is what makes it safe to call from the draft wizard,
// since that same wizard also opens from the history page, where there is no
// live conversation to attribute the stage to.
export function trackStage(stage) {
  const sessionId = read(SESSION_KEY, 'session')
  if (!sessionId) return

  const body = JSON.stringify({ sessionId, stage, mode: read(MODE_KEY, 'mode') })
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Visitor-ID': getVisitorId() },
      body,
      // 'completed' is reported immediately before the redirect away from the
      // page. Without keepalive the browser is free to cancel it in flight,
      // which would lose exactly the conversions we most care about.
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Never let analytics surface as an error in the drafter.
  }
}

function newSessionId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `s_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}
