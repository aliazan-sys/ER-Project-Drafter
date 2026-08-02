// Vercel serverless function — GET /api/funnel
// The one-row funnel summary: conversations started, where people dropped off,
// and how many completed. The same numbers are readable straight from the
// `funnel_summary` view in Supabase; this is just a convenience.
import { funnelSummary } from '../shared/store.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const summary = await funnelSummary()
  if (!summary) return res.status(503).json({ error: 'Tracking storage is not configured.' })
  return res.status(200).json({ summary })
}
