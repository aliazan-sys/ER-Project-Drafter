// Vercel serverless function — POST /api/track
// Records how far one drafter conversation got (see shared/funnel.js).
// Fire-and-forget from the browser: it always answers 200 so a tracking
// problem can never surface as an error in the UI.
import { recordStage } from '../shared/store.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const recorded = await recordStage({
    sessionId: body.sessionId,
    stage: body.stage,
    mode: body.mode,
    visitorId: req.headers['x-visitor-id'] || null,
  })
  return res.status(200).json({ recorded })
}
