import {
  adminAuthConfigured,
  getAdminSession,
  signInAdmin,
  signOutAdmin,
} from '../shared/adminAuth.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')

  if (req.method === 'GET') {
    const user = await getAdminSession(req, res)
    return res.status(200).json({
      authenticated: Boolean(user),
      user,
      configured: adminAuthConfigured(),
    })
  }

  if (req.method === 'POST') {
    if (!adminAuthConfigured()) {
      return res.status(503).json({ error: 'Admin access is not configured.' })
    }

    const { email, password } = req.body || {}
    const result = await signInAdmin(email, password, res)
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.status(200).json({ authenticated: true, user: result.user })
  }

  if (req.method === 'DELETE') {
    await signOutAdmin(req, res)
    return res.status(200).json({ authenticated: false })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
