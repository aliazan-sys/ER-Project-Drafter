import {
  fallbackMarketplaceSuggestions,
  generateMarketplaceSuggestions,
} from '../shared/gemini.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const query = String(req.query?.q || '').trim().slice(0, 120)
  if (!query) return res.status(400).json({ error: 'Missing "q" query parameter.' })

  try {
    const suggestions = await generateMarketplaceSuggestions(query)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ suggestions })
  } catch {
    return res.status(200).json({ suggestions: fallbackMarketplaceSuggestions(query) })
  }
}
