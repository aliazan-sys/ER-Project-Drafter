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
  completePlatformConversation,
  getPlatformConversation,
  recordPlatformSync,
  upsertPlatformConversation,
  listConversations,
  getConversation,
  recordStage,
  funnelSummary,
} from './shared/store.js'
import {
  callBubbleDraftWorkflow,
  normalizeBubbleId,
  verifyProjectOwnership,
} from './shared/platformConversation.js'
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
    const { messages, skipOrgProfile, drafterSource, funnelSessionId, u, p } = req.body || {}
    const mode = drafterSource === 'platform' ? 'platform' : 'website'
    let bubbleUserId = ''
    let bubbleProjectId = ''
    if (mode === 'platform') {
      bubbleUserId = normalizeBubbleId(u)
      bubbleProjectId = normalizeBubbleId(p)
      if (!bubbleUserId || !bubbleProjectId) {
        return res.status(400).json({ error: 'Platform drafts require Bubble user ID (u) and project ID (p).' })
      }
      if (!(await verifyProjectOwnership(bubbleUserId, bubbleProjectId))) {
        return res.status(403).json({ error: 'This user does not own the requested project.' })
      }
    }
    const draft = await generateDraftFromConversation(messages, {
      skipOrgProfile: skipOrgProfile === true,
    })
    let id
    if (mode === 'platform') {
      id = await completePlatformConversation({
        bubbleUserId,
        bubbleProjectId,
        messages,
        draft,
        visitorId: req.get('X-Visitor-ID') || null,
        funnelSessionId,
      })
      if (!id) return res.status(503).json({ error: 'Platform conversation storage is not configured.' })
    } else {
      id = await saveSubmission({
        mode,
        messages,
        draft,
        visitorId: req.get('X-Visitor-ID') || null,
        funnelSessionId,
      })
    }

    res.json({ draft, id })
  } catch (err) {
    if (err instanceof GeminiError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
})

async function authorizePlatformConversation(req, res) {
  const input = req.method === 'GET' ? req.query || {} : req.body || {}
  const bubbleUserId = normalizeBubbleId(input.u)
  const bubbleProjectId = normalizeBubbleId(input.p)
  if (!bubbleUserId || !bubbleProjectId) {
    res.status(400).json({ error: 'Both Bubble user ID (u) and project ID (p) are required.' })
    return null
  }
  if (!(await verifyProjectOwnership(bubbleUserId, bubbleProjectId))) {
    res.status(403).json({ error: 'This user does not own the requested project.' })
    return null
  }
  return { input, bubbleUserId, bubbleProjectId }
}

app.get('/api/platform-conversation', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const auth = await authorizePlatformConversation(req, res)
    if (!auth) return
    const conversation = await getPlatformConversation({
      bubbleUserId: auth.bubbleUserId,
      bubbleProjectId: auth.bubbleProjectId,
      conversationId: String(auth.input.id || '').trim(),
    })
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' })
    res.json({ conversation })
  } catch (err) {
    res.status(500).json({ error: 'Could not load the conversation.', detail: String(err) })
  }
})

app.post('/api/platform-conversation', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const auth = await authorizePlatformConversation(req, res)
    if (!auth) return
    const conversationId = String(auth.input.id || '').trim()
    if (auth.input.action === 'attach' || auth.input.action === 'sync_draft') {
        const conversation = await getPlatformConversation({
          bubbleUserId: auth.bubbleUserId,
          bubbleProjectId: auth.bubbleProjectId,
          conversationId,
        })
        if (!conversation) return res.status(404).json({ error: 'Conversation not found.' })
        if (auth.input.action === 'sync_draft' && (conversation.status !== 'completed' || !conversation.draft)) {
          return res.status(409).json({ error: 'The conversation does not have a completed draft yet.' })
        }
        const payload = auth.input.action === 'attach'
          ? {
              u: auth.bubbleUserId,
              p: auth.bubbleProjectId,
              ai_drafter_token: String(auth.input.ai_drafter_token || ''),
              conversation_id: conversation.id,
              created_by_ai: true,
              conversation_only: true,
            }
          : auth.input.payload
        if (
          !payload ||
          String(payload.u || '') !== auth.bubbleUserId ||
          String(payload.p || '') !== auth.bubbleProjectId ||
          String(payload.conversation_id || '') !== conversation.id
        ) {
          return res.status(400).json({ error: 'Bubble workflow payload does not match the authorized project and conversation.' })
        }
        try {
          await callBubbleDraftWorkflow(payload)
          await recordPlatformSync({
            conversationId,
            bubbleUserId: auth.bubbleUserId,
            bubbleProjectId: auth.bubbleProjectId,
            ok: true,
          })
          return res.json({ ok: true })
        } catch (err) {
          await recordPlatformSync({
            conversationId,
            bubbleUserId: auth.bubbleUserId,
            bubbleProjectId: auth.bubbleProjectId,
            ok: false,
            error: err.message,
          })
          return res.status(502).json({ error: err.message || 'Bubble project update failed.' })
        }
    }
    const messages = Array.isArray(auth.input.messages) ? auth.input.messages.slice(0, 200) : []
    if (!messages.some((message) => message?.role === 'user')) {
      return res.status(400).json({ error: 'At least one user message is required.' })
    }
    const conversation = await upsertPlatformConversation({
      bubbleUserId: auth.bubbleUserId,
      bubbleProjectId: auth.bubbleProjectId,
      messages,
      visitorId: req.get('X-Visitor-ID') || null,
      funnelSessionId: auth.input.funnelSessionId,
    })
    if (!conversation) return res.status(503).json({ error: 'Conversation storage is not configured.' })
    res.json({ conversation })
  } catch (err) {
    console.error('[/api/platform-conversation] error:', err)
    res.status(500).json({ error: 'Could not save or sync the conversation.' })
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
  const { sessionId, stage, mode, attribution } = req.body || {}
  const recorded = await recordStage({
    sessionId,
    stage,
    mode,
    visitorId: req.get('X-Visitor-ID') || null,
    attribution,
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
