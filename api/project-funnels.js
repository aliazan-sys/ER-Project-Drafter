import { listProjectFunnels } from '../shared/store.js'
import { requireAdmin } from '../shared/adminAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!(await requireAdmin(req, res))) return
  try {
    return res.status(200).json({ projects: await listProjectFunnels() })
  } catch (err) {
    return res.status(500).json({ error: 'Could not load project funnel data.', detail: String(err) })
  }
}
