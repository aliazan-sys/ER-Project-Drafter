// ---------------------------------------------------------------------------
// EqualReach AI Prototype — LOCAL dev proxy server (used by `npm run dev`).
//
// In production on Vercel the same logic runs as a serverless function
// (api/draft.js). Both share shared/gemini.js, so the Gemini key is only ever
// read server-side. Locally the key comes from .env; on Vercel from the
// project's Environment Variables.
// ---------------------------------------------------------------------------

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import {
  MODEL,
  hasApiKey,
  generateDraftFromConversation,
  chatReply,
  generateMarketplaceSuggestions,
  fallbackMarketplaceSuggestions,
  GeminiError,
} from './shared/gemini.js'
import {
  saveSubmission,
  listConversations,
  getConversation,
  recordStage,
  funnelSummary,
} from './shared/store.js'
import { suggestPlaces, hasPlacesKey, PlacesError } from './shared/places.js'
import {
  adminAuthConfigured,
  getAdminSession,
  requireAdmin,
  signInAdmin,
  signOutAdmin,
} from './shared/adminAuth.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 3001

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    keyConfigured: hasApiKey(),
    placesConfigured: hasPlacesKey(),
  })
})

app.get('/api/admin-auth', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const user = await getAdminSession(req, res)
  res.json({
    authenticated: Boolean(user),
    user,
    configured: adminAuthConfigured(),
  })
})

app.post('/api/admin-auth', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  if (!adminAuthConfigured()) {
    return res.status(503).json({ error: 'Admin access is not configured.' })
  }
  const { email, password } = req.body || {}
  const result = await signInAdmin(email, password, res)
  if (!result.ok) return res.status(result.status).json({ error: result.error })
  return res.json({ authenticated: true, user: result.user })
})

app.delete('/api/admin-auth', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  await signOutAdmin(req, res)
  res.json({ authenticated: false })
})

async function requireLocalAdmin(req, res, next) {
  if (!(await requireAdmin(req, res))) return
  next()
}

app.get('/api/marketplace-suggestions', async (req, res) => {
  const query = String(req.query?.q || '').trim().slice(0, 120)
  if (!query) return res.status(400).json({ error: 'Missing "q" query parameter.' })

  try {
    res.json({ suggestions: await generateMarketplaceSuggestions(query) })
  } catch (err) {
    console.error('[/api/marketplace-suggestions] error:', err)
    res.json({ suggestions: fallbackMarketplaceSuggestions(query) })
  }
})

// One conversational turn for the Project Drafter.
app.post('/api/chat', async (req, res) => {
  try {
    const messages = req.body?.messages
    console.log('\n[/api/chat] messages received:', JSON.stringify(messages, null, 2))
    const result = await chatReply(messages, {
      skipOrgProfile: req.body?.skipOrgProfile === true,
      drafterSource: req.body?.drafterSource,
    })
    console.log('[/api/chat] result:', JSON.stringify(result))
    res.json(result)
  } catch (err) {
    console.error('[/api/chat] error:', err)
    if (err instanceof GeminiError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
})

// Generates and persists a draft from the Project Drafter conversation.
app.post('/api/draft', async (req, res) => {
  try {
    const { messages, skipOrgProfile, drafterSource } = req.body || {}
    const draft = await generateDraftFromConversation(messages, {
      skipOrgProfile: skipOrgProfile === true,
    })
    const mode = drafterSource === 'platform' ? 'platform' : 'website'
    const id = await saveSubmission({ mode, messages, draft })

    res.json({ draft, id })
  } catch (err) {
    if (err instanceof GeminiError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
})

// Geographic autocomplete for the Review step's Location chip. Mirrors
// api/places.js — both go through shared/places.js so the Maps key is only
// ever read server-side.
app.get('/api/places', async (req, res) => {
  try {
    res.json(await suggestPlaces(req.query.q))
  } catch (err) {
    console.error('[/api/places] error:', err)
    if (err instanceof PlacesError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
})

// Funnel tracking: how far each conversation got. Always 200 — a tracking
// failure must never show up in the UI. Mirrors api/track.js.
app.post('/api/track', async (req, res) => {
  const { sessionId, stage, mode } = req.body || {}
  const recorded = await recordStage({
    sessionId,
    stage,
    mode,
    visitorId: req.get('X-Visitor-ID') || null,
  })
  res.json({ recorded })
})

// Website and Platform funnel numbers. Mirrors api/funnel.js.
app.get('/api/funnel', requireLocalAdmin, async (_req, res) => {
  const summary = await funnelSummary()
  if (!summary) return res.status(503).json({ error: 'Tracking storage is not configured.' })
  res.json({ summary })
})

// History: list all saved conversations, or fetch one (with transcript + draft).
app.get('/api/conversations', requireLocalAdmin, async (req, res) => {
  try {
    if (req.query.id) {
      const row = await getConversation(req.query.id)
      if (!row) return res.status(404).json({ error: 'Not found' })
      return res.json({ conversation: row })
    }
    res.json({ conversations: await listConversations() })
  } catch (err) {
    res.status(500).json({ error: 'Could not load conversations.', detail: String(err) })
  }
})

const httpServer = app.listen(PORT, () => {
  console.log(`\n  EqualReach proxy running on http://localhost:${PORT}`)
  console.log(`  Model: ${MODEL}`)
  console.log(
    hasApiKey()
      ? '  Gemini API key: loaded from .env ✓'
      : '  Gemini API key: NOT SET — copy .env.example to .env and add it.'
  )
  // Optional: without it the Location field is still usable, just free text.
  console.log(
    hasPlacesKey()
      ? '  Google Maps API key: loaded from .env ✓\n'
      : '  Google Maps API key: NOT SET — Location autocomplete is off (plain text still works).\n'
  )
})

// Friendly message instead of a raw stack trace when the port is taken
// (usually a leftover server from a previous run).
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  ✗ Port ${PORT} is already in use — a previous server is probably still running.\n` +
        `    Close it, or set a different PORT in your .env file, then try again.\n` +
        `    (Windows: netstat -ano | findstr :${PORT}  then  taskkill /PID <pid> /F)\n`
    )
    process.exit(1)
  }
  throw err
})
