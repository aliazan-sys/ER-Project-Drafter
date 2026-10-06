import {
  getPlatformConversation,
  recordPlatformSync,
  upsertPlatformConversation,
} from '../shared/store.js'
import {
  callBubbleDraftWorkflow,
  normalizeBubbleId,
  verifyProjectOwnership,
} from '../shared/platformConversation.js'

const parseBody = (req) =>
  typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const input = req.method === 'GET' ? req.query || {} : parseBody(req)
    const bubbleUserId = normalizeBubbleId(input.u)
    const bubbleProjectId = normalizeBubbleId(input.p)
    const conversationId = String(input.id || '').trim()
    if (!bubbleUserId || !bubbleProjectId) {
      return res.status(400).json({ error: 'Both Bubble user ID (u) and project ID (p) are required.' })
    }
    if (!(await verifyProjectOwnership(bubbleUserId, bubbleProjectId))) {
      return res.status(403).json({ error: 'This user does not own the requested project.' })
    }

    if (req.method === 'GET') {
      const conversation = await getPlatformConversation({
        bubbleUserId,
        bubbleProjectId,
        conversationId,
      })
      if (!conversation) return res.status(404).json({ error: 'Conversation not found.' })
      return res.status(200).json({ conversation })
    }

    if (input.action === 'attach' || input.action === 'sync_draft') {
      const conversation = await getPlatformConversation({
        bubbleUserId,
        bubbleProjectId,
        conversationId,
      })
      if (!conversation) return res.status(404).json({ error: 'Conversation not found.' })
      if (input.action === 'sync_draft' && (conversation.status !== 'completed' || !conversation.draft)) {
        return res.status(409).json({ error: 'The conversation does not have a completed draft yet.' })
      }
      const payload = input.action === 'attach'
        ? {
            u: bubbleUserId,
            p: bubbleProjectId,
            ai_drafter_token: String(input.ai_drafter_token || ''),
            conversation_id: conversation.id,
            created_by_ai: true,
            conversation_only: true,
          }
        : input.payload
      if (
        !payload ||
        String(payload.u || '') !== bubbleUserId ||
        String(payload.p || '') !== bubbleProjectId ||
        String(payload.conversation_id || '') !== conversation.id
      ) {
        return res.status(400).json({ error: 'Bubble workflow payload does not match the authorized project and conversation.' })
      }
      try {
        await callBubbleDraftWorkflow(payload)
        await recordPlatformSync({ conversationId, bubbleUserId, bubbleProjectId, ok: true })
        return res.status(200).json({ ok: true })
      } catch (err) {
        await recordPlatformSync({
          conversationId,
          bubbleUserId,
          bubbleProjectId,
          ok: false,
          error: err.message,
        })
        return res.status(502).json({ error: err.message || 'Bubble project update failed.' })
      }
    }

    const messages = Array.isArray(input.messages) ? input.messages.slice(0, 200) : []
    if (!messages.some((message) => message?.role === 'user')) {
      return res.status(400).json({ error: 'At least one user message is required.' })
    }
    const conversation = await upsertPlatformConversation({
      bubbleUserId,
      bubbleProjectId,
      messages,
      visitorId: req.headers['x-visitor-id'] || null,
      funnelSessionId: input.funnelSessionId,
    })
    if (!conversation) {
      return res.status(503).json({ error: 'Conversation storage is not configured.' })
    }
    return res.status(200).json({ conversation })
  } catch (err) {
    console.error('[/api/platform-conversation] error:', err)
    return res.status(500).json({ error: 'Could not save, load, or sync the conversation.' })
  }
}
