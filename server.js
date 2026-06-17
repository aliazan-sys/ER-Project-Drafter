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
  generateDraft,
  generateDraftFromConversation,
  chatReply,
  GeminiError,
} from './shared/gemini.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 3001

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, keyConfigured: hasApiKey() })
})

// One conversational turn for the chatbot page.
app.post('/api/chat', async (req, res) => {
  try {
    const result = await chatReply(req.body?.messages)
    res.json(result)
  } catch (err) {
    if (err instanceof GeminiError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
})

// Drafts from either the guided form's `answers` or the chatbot's `messages`.
app.post('/api/draft', async (req, res) => {
  try {
    const draft = req.body?.messages
      ? await generateDraftFromConversation(req.body.messages)
      : await generateDraft(req.body?.answers)
    res.json({ draft })
  } catch (err) {
    if (err instanceof GeminiError) {
      return res.status(err.status).json({ error: err.message, detail: err.detail })
    }
    res.status(500).json({ error: 'Unexpected server error.', detail: String(err) })
  }
})

const httpServer = app.listen(PORT, () => {
  console.log(`\n  EqualReach proxy running on http://localhost:${PORT}`)
  console.log(`  Model: ${MODEL}`)
  console.log(
    hasApiKey()
      ? '  Gemini API key: loaded from .env ✓\n'
      : '  Gemini API key: NOT SET — copy .env.example to .env and add it.\n'
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
