// Vercel serverless function — POST /api/draft
// Same origin as the frontend, so the browser calls /api/draft and the key
// (a Vercel Environment Variable) never leaves the server.
import { generateDraftFromConversation, GeminiError } from '../shared/gemini.js'
import { saveSubmission } from '../shared/store.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Vercel parses JSON bodies automatically, but guard for string bodies too.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const draft = await generateDraftFromConversation(body.messages, {
      skipOrgProfile: body.skipOrgProfile === true,
    })
    const mode = body.drafterSource === 'platform' ? 'platform' : 'website'
    const visitorId = req.headers['x-visitor-id'] || null
    const id = await saveSubmission({ mode, messages: body.messages, draft, visitorId })

    return res.status(200).json({ draft, id })
  } catch (err) {
    if (err instanceof GeminiError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    return res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
}
