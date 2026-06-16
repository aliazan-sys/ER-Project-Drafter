// Vercel serverless function — GET /api/health
import { MODEL, hasApiKey } from '../shared/gemini.js'

export default function handler(_req, res) {
  res.status(200).json({ ok: true, model: MODEL, keyConfigured: hasApiKey() })
}
