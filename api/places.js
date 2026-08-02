// Vercel serverless function — GET /api/places?q=<partial address>
// Geographic autocomplete for the Review step's Location chip. Same origin as
// the frontend, so the browser calls /api/places and the Google Maps key (a
// Vercel Environment Variable) never leaves the server.
import { suggestPlaces, PlacesError } from '../shared/places.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const result = await suggestPlaces(req.query?.q)
    // Predictions for the same prefix are stable for a good while, and the
    // user retypes the same prefixes constantly (backspace, re-edit). A short
    // shared cache absorbs those without another billed lookup.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
    return res.status(200).json(result)
  } catch (err) {
    if (err instanceof PlacesError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    return res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
}
