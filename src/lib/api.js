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

export async function checkHealth() {
  try {
    const res = await fetch('/api/health')
    return await res.json()
  } catch {
    return { ok: false, keyConfigured: false }
  }
}
