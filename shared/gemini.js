// ---------------------------------------------------------------------------
// Shared Gemini logic — used by BOTH the local Express server (server.js, for
// `npm run dev`) and the Vercel serverless function (api/draft.js, in prod).
//
// The API key is read from process.env at call time and is NEVER sent to the
// browser. Locally it comes from .env; on Vercel it comes from the project's
// Environment Variables.
// ---------------------------------------------------------------------------

export const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

export const hasApiKey = () => Boolean(process.env.GEMINI_API_KEY)

// JSON shape we ask Gemini to return. Mirrors the 7-step EqualReach
// "Project Request" form from the reference images.
export const responseSchema = {
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

// ---------------------------------------------------------------------------
// Conversational "chatbot" mode
// ---------------------------------------------------------------------------

// What the chat turn returns: a short conversational reply, plus a flag the
// agent flips once it has gathered enough to write a solid draft.
export const chatResponseSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    readyToDraft: { type: 'boolean' },
  },
  required: ['reply', 'readyToDraft'],
}

const buildChatSystemInstruction = (today) => `You are the "EqualReach Project Assistant",
a warm, friendly conversational AI. Today's date is ${today} — treat it as "now".
EqualReach connects organisations (especially non-profits and social enterprises)
with skilled partners. Your job is to chat with a user about a project they want
done and gather just enough detail to draft a professional project request.

Behave like a helpful chatbot, not a form:
- The user describes a project they want to get done. Respond naturally.
- Ask only the MOST relevant clarifying questions — at most 3 to 4 across the WHOLE
  conversation, and only ONE question per message. Don't interrogate.
- Skip anything the user has already made clear; never re-ask what you know.
- Aim to understand: what they want built/done, who it's for and what success looks
  like, rough timeline and budget, and any specific skills, tools or must-haves.
- If the user seems confused or asks what something means, explain it simply in
  plain language with a quick example, then gently re-ask in an easier way.
- Keep every reply short and conversational (1-3 sentences). Be encouraging.

When you have enough to write a solid draft (usually after 3-4 good answers), set
readyToDraft to true and write a short, friendly closing message saying you'll put
the draft together now. Once readyToDraft is true, do NOT ask more questions.
Until then, keep readyToDraft false.

Never write the actual project draft in this conversation — that happens in a
separate step. Always answer with the JSON shape { reply, readyToDraft }.`

// Error carrying an HTTP status so callers can forward it verbatim.
export class GeminiError extends Error {
  constructor(status, message, detail) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

const today = () =>
  new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// Low-level call shared by every Gemini-backed feature. Returns the parsed JSON
// object the model produced. Throws GeminiError on any failure.
async function callGemini({ systemText, contents, schema, temperature = 0.7 }) {
  const API_KEY = process.env.GEMINI_API_KEY
  if (!API_KEY) {
    throw new GeminiError(
      500,
      'GEMINI_API_KEY is not set on the server. Add it to your environment and redeploy.'
    )
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

  let r
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY, // key stays server-side
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: {
          temperature,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    })
  } catch (err) {
    throw new GeminiError(500, 'Request to Gemini failed.', String(err))
  }

  if (!r.ok) {
    const detail = await r.text()
    throw new GeminiError(r.status, `Gemini API error (${r.status})`, detail)
  }

  const data = await r.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new GeminiError(502, 'Empty response from Gemini.')

  try {
    return JSON.parse(text)
  } catch {
    throw new GeminiError(502, 'Could not parse Gemini JSON.', text)
  }
}

// Maps our { role: 'bot' | 'user', text } messages to Gemini's contents shape.
const toContents = (messages) =>
  (messages || [])
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }))

// One conversational turn. `messages` is the full transcript so far (ending with
// the user's latest message). Returns { reply, readyToDraft }.
export async function chatReply(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new GeminiError(400, 'Missing "messages" in request body.')
  }
  return callGemini({
    systemText: buildChatSystemInstruction(today()),
    contents: toContents(messages),
    schema: chatResponseSchema,
    temperature: 0.6,
  })
}

// Turns the user's intake answers into a full project draft object.
// Throws GeminiError(status, message, detail) on any failure.
export async function generateDraft(answers) {
  if (!answers || typeof answers !== 'object') {
    throw new GeminiError(400, 'Missing "answers" in request body.')
  }

  const userPrompt =
    'Here are the user\'s answers to the intake questions:\n\n' +
    Object.entries(answers)
      .map(([q, a]) => `Q: ${q}\nA: ${a || '(no answer)'}`)
      .join('\n\n') +
    '\n\nDraft the full EqualReach project request now.'

  return callGemini({
    systemText: buildSystemInstruction(today()),
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    schema: responseSchema,
  })
}

// Turns a free-form chatbot conversation into a full project draft object.
export async function generateDraftFromConversation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new GeminiError(400, 'Missing "messages" in request body.')
  }

  const transcript = messages
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n')

  const userPrompt =
    'Here is the conversation between the EqualReach assistant and the user:\n\n' +
    transcript +
    '\n\nBased on this whole conversation, draft the full EqualReach project request now.'

  return callGemini({
    systemText: buildSystemInstruction(today()),
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    schema: responseSchema,
  })
}
