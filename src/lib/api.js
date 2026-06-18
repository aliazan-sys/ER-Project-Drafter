// Talks to our own Express proxy (server.js), never directly to Google.
// The API key lives on the server, so it is never exposed to the browser.
export async function generateDraft(answers) {
  const res = await fetch('/api/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data.draft
}

// One conversational turn. `messages` is the full transcript so far
// ([{ role: 'bot' | 'user', text }]). Returns { reply, readyToDraft }.
export async function sendChat(messages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

// Drafts a full project request from a chatbot conversation transcript.
export async function generateDraftFromChat(messages) {
  const res = await fetch('/api/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data.draft
}

// History: list all saved conversations (newest first).
export async function listConversations() {
  const res = await fetch('/api/conversations')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data.conversations || []
}

// History: fetch one conversation's transcript + draft.
export async function getConversation(id) {
  const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`)
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
