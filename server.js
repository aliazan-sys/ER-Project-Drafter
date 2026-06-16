// ---------------------------------------------------------------------------
// EqualReach AI Prototype — local proxy server
//
// This tiny Express server is the ONLY place that ever sees the Gemini API
// key. The React frontend calls THIS server (/api/draft); this server adds the
// key and forwards the request to Google. The key lives in .env and is never
// shipped to the browser.
// ---------------------------------------------------------------------------

import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 3001
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const API_KEY = process.env.GEMINI_API_KEY

// JSON shape we ask Gemini to return. Mirrors the 7-step EqualReach
// "Project Request" form from the reference images.
const responseSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    categories: { type: 'array', items: { type: 'string' } },
    skills: { type: 'array', items: { type: 'string' } },
    scope: {
      type: 'object',
      properties: {
        complexity: { type: 'string', enum: ['Large', 'Medium', 'Small'] },
        startDate: { type: 'string' },
        completionDate: { type: 'string' },
      },
    },
    budget: {
      type: 'object',
      properties: {
        pricingType: {
          type: 'string',
          enum: ['Per Unit', 'Monthly Rate', 'Fixed Price', 'Not Sure'],
        },
        currency: { type: 'string' },
        estimatedCost: { type: 'string' },
        comments: { type: 'string' },
      },
    },
    description: { type: 'string' },
    existingAssets: { type: 'string' },
    projectGoals: {
      type: 'object',
      properties: {
        impactGoal: { type: 'string' },
        impactDescription: { type: 'string' },
      },
    },
    orgProfile: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        size: { type: 'string' },
        industry: { type: 'string' },
        location: { type: 'string' },
      },
    },
    screeningQuestions: { type: 'array', items: { type: 'string' } },
    levelOfExperience: {
      type: 'string',
      enum: ['Entry', 'Intermediate', 'Expert'],
    },
    advancedTerms: {
      type: 'object',
      properties: {
        languages: { type: 'array', items: { type: 'string' } },
        timezone: { type: 'string' },
      },
    },
  },
  required: ['title', 'categories', 'description', 'scope', 'budget', 'projectGoals'],
}

const buildSystemInstruction = (today) => `You are the "EqualReach Project Request Drafter".
Today's date is ${today}. Treat this as "now" — every date you produce
(start dates, completion dates, timelines) MUST be in the future relative to it,
and any year you mention must be ${today.slice(-4)} or later. Never use a past year.
EqualReach connects organisations (especially non-profits and social enterprises)
with skilled partners. A user has answered a few short questions about what they
need. Your job is to turn those answers into a complete, professional project
request draft, filling EVERY field with thoughtful, specific, realistic content —
never leave a field blank and never write placeholder text like "N/A" or "TBD".

Guidelines:
- title: short, clear, outcome-oriented (max ~8 words).
- categories: 1-3 high-level skill categories (e.g. "Web Development",
  "Brand & Design", "Marketing").
- skills: 3-6 concrete tools/skills (e.g. "React", "Figma", "SEO", "Copywriting").
- scope.complexity: pick Large / Medium / Small based on the ask.
- scope.startDate / completionDate: realistic human dates in the future relative
  to today (e.g. "Early July 2026", "End of September 2026"). Infer sensible
  defaults if the user didn't say.
- budget.pricingType: best fit of Per Unit / Monthly Rate / Fixed Price / Not Sure.
- budget.currency: default "GBP" unless the user implies otherwise.
- budget.estimatedCost: a realistic figure or range with the currency symbol.
- description: 2-4 rich paragraphs covering deliverables, success criteria,
  collaboration style and scope clarity (this is the meatiest field).
- existingAssets: what the client likely already has, or "None specified" if truly none.
- projectGoals.impactGoal: the successful-outcome statement in the user's voice.
- projectGoals.impactDescription: the longer-run organisational/social impact.
- orgProfile: infer type (e.g. Non-profit, Startup), size, industry and location.
- screeningQuestions: 2-3 sharp questions to vet partners.
- levelOfExperience: Entry / Intermediate / Expert.
- advancedTerms.languages: e.g. ["English"]. advancedTerms.timezone: e.g. "GMT (London)".

Return ONLY the structured JSON. Be specific and concrete — invent reasonable,
professional details where the user was vague.`

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, keyConfigured: Boolean(API_KEY) })
})

app.post('/api/draft', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error:
        'GEMINI_API_KEY is not set. Copy .env.example to .env and add your key, then restart the server.',
    })
  }

  const { answers } = req.body || {}
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Missing "answers" in request body.' })
  }

  const userPrompt =
    'Here are the user\'s answers to the intake questions:\n\n' +
    Object.entries(answers)
      .map(([q, a]) => `Q: ${q}\nA: ${a || '(no answer)'}`)
      .join('\n\n') +
    '\n\nDraft the full EqualReach project request now.'

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const systemInstruction = buildSystemInstruction(today)

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY, // key stays server-side
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
    })

    if (!r.ok) {
      const detail = await r.text()
      return res
        .status(r.status)
        .json({ error: `Gemini API error (${r.status})`, detail })
    }

    const data = await r.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      return res.status(502).json({ error: 'Empty response from Gemini.', raw: data })
    }

    let draft
    try {
      draft = JSON.parse(text)
    } catch {
      return res.status(502).json({ error: 'Could not parse Gemini JSON.', raw: text })
    }

    res.json({ draft })
  } catch (err) {
    res.status(500).json({ error: 'Request to Gemini failed.', detail: String(err) })
  }
})

const httpServer = app.listen(PORT, () => {
  console.log(`\n  EqualReach proxy running on http://localhost:${PORT}`)
  console.log(`  Model: ${MODEL}`)
  console.log(
    API_KEY
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
