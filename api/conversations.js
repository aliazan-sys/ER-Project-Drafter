// Vercel serverless function — GET /api/conversations
//   GET /api/conversations          → list of saved conversations (summaries)
//   GET /api/conversations?id=<id>  → one conversation's transcript + draft
import { listConversations, getConversation } from '../shared/store.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const visitorId = req.headers['x-visitor-id'] || null
    const id = req.query?.id
    if (id) {
      const row = await getConversation(id)
      if (!row) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json({ conversation: row })
    }
    return res.status(200).json({ conversations: await listConversations(visitorId) })
  } catch (err) {
    return res.status(500).json({ error: 'Could not load conversations.', detail: String(err) })
  }
}
