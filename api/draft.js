// Vercel serverless function — POST /api/draft
// Same origin as the frontend, so the browser calls /api/draft and the key
// (a Vercel Environment Variable) never leaves the server.
import { generateDraftFromConversation, GeminiError } from '../shared/gemini.js'
import { completePlatformConversation, saveSubmission } from '../shared/store.js'
import { normalizeBubbleId, verifyProjectOwnership } from '../shared/platformConversation.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Vercel parses JSON bodies automatically, but guard for string bodies too.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const mode = body.drafterSource === 'platform' ? 'platform' : 'website'
    let bubbleUserId = ''
    let bubbleProjectId = ''
    if (mode === 'platform') {
      bubbleUserId = normalizeBubbleId(body.u)
      bubbleProjectId = normalizeBubbleId(body.p)
      if (!bubbleUserId || !bubbleProjectId) {
        return res.status(400).json({ error: 'Platform drafts require Bubble user ID (u) and project ID (p).' })
      }
      if (!(await verifyProjectOwnership(bubbleUserId, bubbleProjectId))) {
        return res.status(403).json({ error: 'This user does not own the requested project.' })
      }
    }
    const draft = await generateDraftFromConversation(body.messages, {
      skipOrgProfile: body.skipOrgProfile === true,
    })
    const visitorId = req.headers['x-visitor-id'] || null
    let id
    if (mode === 'platform') {
      id = await completePlatformConversation({
        bubbleUserId,
        bubbleProjectId,
        messages: body.messages,
        draft,
        visitorId,
        funnelSessionId: body.funnelSessionId,
      })
      if (!id) return res.status(503).json({ error: 'Platform conversation storage is not configured.' })
    } else {
      id = await saveSubmission({
        mode,
        messages: body.messages,
        draft,
        visitorId,
        funnelSessionId: body.funnelSessionId,
      })
    }

    return res.status(200).json({ draft, id })
  } catch (err) {
    if (err instanceof GeminiError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    return res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
}
