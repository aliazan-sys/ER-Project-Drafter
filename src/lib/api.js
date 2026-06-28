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

export async function checkHealth() {
  try {
    const res = await fetch('/api/health')
    return await res.json()
  } catch {
    return { ok: false, keyConfigured: false }
  }
}
