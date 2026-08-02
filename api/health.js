// Vercel serverless function — GET /api/health
import { MODEL, hasApiKey } from '../shared/gemini.js'
import { hasPlacesKey } from '../shared/places.js'

export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    model: MODEL,
    keyConfigured: hasApiKey(),
    // Optional — only gates Location autocomplete, not the app. Reported so a
    // missing GOOGLE_MAPS_API_KEY is one request away from being confirmed.
    placesConfigured: hasPlacesKey(),
  })
}
