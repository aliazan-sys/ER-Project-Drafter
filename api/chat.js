// Vercel serverless function — POST /api/chat
// One conversational turn for the chatbot page. Same origin as the frontend, so
// the browser calls /api/chat and the key (a Vercel Environment Variable) never
// leaves the server.
import { chatReply, GeminiError } from '../shared/gemini.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Vercel parses JSON bodies automatically, but guard for string bodies too.
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const result = await chatReply(body.messages)
    return res.status(200).json(result)
  } catch (err) {
    if (err instanceof GeminiError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    return res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
}
