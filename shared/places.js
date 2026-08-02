// ---------------------------------------------------------------------------
// Shared Google Places logic — used by BOTH the local Express server
// (server.js, for `npm run dev`) and the Vercel serverless function
// (api/places.js, in prod).
//
// Same rule as shared/gemini.js: the API key is read from process.env at call
// time and is NEVER sent to the browser. Locally it comes from .env; on Vercel
// from the project's Environment Variables. Keeping the call server-side also
// means the key can be locked to this backend rather than left open to any
// referrer, which is what a browser-loaded Maps key would require.
// ---------------------------------------------------------------------------

// Places API (New). The legacy Place Autocomplete endpoint is closed to new
// projects, so a freshly minted key only works against this one.
const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete'

// Only the prediction fields we actually render — the response mask keeps the
// payload (and the per-request billing SKU) to the minimum.
const FIELD_MASK = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text.text',
  'suggestions.placePrediction.structuredFormat.mainText.text',
  'suggestions.placePrediction.structuredFormat.secondaryText.text',
].join(',')

// "geocode" is the geographic collection: street addresses, cities, regions
// and countries, but NOT businesses. That is exactly what an organisation's
// location field wants — "Acme Ltd" is not an address.
const GEOCODE_TYPES = ['geocode']

// Google caps the list at five; more than that is noise in a chip-sized menu.
const MAX_SUGGESTIONS = 5

// Anything shorter is nearly all of Google's index — not worth a billed call.
export const MIN_QUERY_LENGTH = 3

export const hasPlacesKey = () => Boolean(process.env.GOOGLE_MAPS_API_KEY)

export class PlacesError extends Error {
  constructor(message, status = 502, detail = '') {
    super(message)
    this.name = 'PlacesError'
    this.status = status
    this.detail = detail
  }
}

// Suggest geographic places for a partial address, as the user types.
//
// Returns { suggestions, configured }. `configured: false` means no key is set
// — NOT an error: the Location field stays a plain text input in that case, so
// the form still works before the key is added.
export async function suggestPlaces(input) {
  const query = String(input ?? '').trim()

  if (!hasPlacesKey()) return { suggestions: [], configured: false }
  // Typing guard only — resolvePlace() deliberately skips it, because a
  // finished value can legitimately be two characters ("UK").
  if (query.length < MIN_QUERY_LENGTH) return { suggestions: [], configured: true }

  return { suggestions: await requestPredictions(query), configured: true }
}

// Resolve a COMPLETE location string — one the AI wrote from the conversation,
// not something being typed — to the canonical place Google recognises.
// "london" -> "London, UK"; "Nairobi Kenya" -> "Nairobi, Kenya".
//
// Returns { value, resolved }:
//  - resolved: true  -> value is Google's canonical form, safe to show
//  - resolved: false -> value is '' when Google clearly knows no such place
//    (the model wrote "remote", "across Europe", …), or the ORIGINAL string
//    when we simply could not check — no key, or the lookup failed. Never
//    discard a value over a transient problem; only over a definite answer.
export async function resolvePlace(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return { value: '', resolved: false }
  if (isNonPlace(raw)) return { value: '', resolved: false }
  if (!hasPlacesKey()) return { value: raw, resolved: false }

  try {
    const predictions = await requestPredictions(raw)
    if (predictions.length) return { value: predictions[0].value, resolved: true }
    // A clean "no such geographic place" — the field is required, so clearing
    // it hands the user an empty box with autocomplete rather than a made-up
    // address that would ship to the matched teams as fact.
    return { value: '', resolved: false }
  } catch {
    return { value: raw, resolved: false }
  }
}

// Autocomplete matches on prefix, which makes it dangerously willing to find
// SOMETHING: "remote" comes back as "Remote North Parking, DFW … Dallas, TX".
// Silently planting an airport car park as an organisation's address is worse
// than an empty field, so the handful of phrases a model actually reaches for
// when there is no fixed location are rejected before we ever ask Google.
// Matched against the whole value, so real places ("Global, Kansas") survive.
const NON_PLACE_VALUES = new Set([
  'remote', 'fully remote', 'remote first', 'work from home', 'wfh',
  'hybrid', 'distributed', 'fully distributed', 'distributed team',
  'virtual', 'online', 'internet',
  'global', 'globally', 'worldwide', 'international', 'nationwide',
  'anywhere', 'everywhere', 'various', 'various locations', 'multiple locations',
  'head office', 'our head office', 'main office',
  'n/a', 'na', 'none', 'unknown', 'not specified', 'not stated', 'tbd', 'tba',
])

function isNonPlace(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[.,;:!?()"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (NON_PLACE_VALUES.has(normalized)) return true
  // "across Europe", "throughout the UK" — a region described rather than named.
  return /^(across|throughout|all over|around) /.test(normalized)
}

async function requestPredictions(query) {
  let res
  try {
    res = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: GEOCODE_TYPES,
        // Bias the language of the predictions, not the region they cover —
        // an organisation can be anywhere.
        languageCode: 'en',
      }),
    })
  } catch (err) {
    throw new PlacesError('Could not reach the address service.', 502, String(err))
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new PlacesError(
      data?.error?.message || `Address lookup failed (${res.status}).`,
      res.status === 400 || res.status === 403 ? res.status : 502,
      JSON.stringify(data?.error ?? {}),
    )
  }

  return (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS)
    .map((p) => ({
      id: p.placeId,
      // What lands in the field when picked: the full formatted place.
      value: p.text?.text || p.structuredFormat?.mainText?.text || '',
      // Two-line display: "10 Downing Street" / "London, UK".
      main: p.structuredFormat?.mainText?.text || p.text?.text || '',
      secondary: p.structuredFormat?.secondaryText?.text || '',
    }))
    .filter((s) => s.value)
}
