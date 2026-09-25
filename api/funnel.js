// Vercel serverless function — GET /api/funnel
// Separate Website and Platform funnel summaries: conversations started,
// where people dropped off, and how many completed.
import { funnelSummary } from '../shared/store.js'
import { requireAdmin } from '../shared/adminAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!(await requireAdmin(req, res))) return

  const summary = await funnelSummary()
  if (!summary) return res.status(503).json({ error: 'Tracking storage is not configured.' })
  return res.status(200).json({ summary })
}
