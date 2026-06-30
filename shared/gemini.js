// ---------------------------------------------------------------------------
// Shared Gemini logic — used by BOTH the local Express server (server.js, for
// `npm run dev`) and the Vercel serverless function (api/draft.js, in prod).
//
// The API key is read from process.env at call time and is NEVER sent to the
// browser. Locally it comes from .env; on Vercel it comes from the project's
// Environment Variables.
// ---------------------------------------------------------------------------

// Provider selection: prefer OpenRouter when its key is present, otherwise fall
// back to Gemini. Both read keys from process.env at call time; neither key is
// ever sent to the browser.
const useOpenRouter = () => Boolean(process.env.OPENROUTER_API_KEY)

export const MODEL = process.env.OPENROUTER_API_KEY
  ? process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
  : process.env.GEMINI_MODEL || 'gemini-2.0-flash'

export const hasApiKey = () =>
  Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY)

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

const buildChatSystemInstruction = (today) => `You are a project intake assistant for EqualReach. Today is ${today}.

You need to collect all of the following fields before drafting:
1. Description — what the project is and what needs to be done
2. Timeline — start date and end date (or rough timeframe)
3. Budget — how much they plan to spend and preferred pricing type
4. Goals — what success looks like for this project
5. Additional information — any specific skills, tools, constraints, or assets relevant to the project

Rules:
- Before every reply, read the full conversation and mark which fields are already covered — explicitly or implicitly.
- Ask only about fields that are still missing.
- Ask one question per reply. One short sentence. Nothing else.
- Never ask about a field that has already been answered, even partially.
- If a field can be reasonably inferred from what the user said, treat it as answered — do not ask again.
- Field 5 is optional — if nothing relevant is missing, skip it.

STRICT OUTPUT RULE — your reply must be ONLY the next question (or the closing line). Nothing before it, nothing after it.
Forbidden — never output any of the following:
- Compliments or reactions: "Great!", "Fantastic!", "That sounds exciting!", "Nice!", "Wonderful!", "I love that!", "That's a great idea!"
- Acknowledgements: "Got it", "Sure", "Of course", "Understood", "Thanks", "I see", "Makes sense"
- Reflections: repeating or paraphrasing what the user just said
- Introductions: "It's great to meet you", "Happy to help", "I'm here to assist you"
- Transitions: "Now,", "Next,", "Moving on,", "Let's talk about"
- Any sentence that is not the question itself

Your reply is ONE sentence: the question. That is all.

Example — if the user says "I want to build a website for my charity":
WRONG: "That's wonderful! A website can really help your charity reach more people. What kind of content do you want on it?"
RIGHT: "What is the website meant to help visitors do?"

Once all required fields are collected, set readyToDraft to true and reply with exactly: "Drafting your project request now."

Never write the draft itself here. Always reply as JSON { reply, readyToDraft }.`

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

// Same contract as callGemini, but via OpenRouter's OpenAI-compatible Chat
// Completions API. We convert Gemini's `contents` shape into OpenAI `messages`
// and ask for a JSON object back. The schema is enforced by the detailed
// instructions in `systemText` (every prompt already describes its JSON shape).
async function callOpenRouter({ systemText, contents, temperature = 0.7 }) {
  const API_KEY = process.env.OPENROUTER_API_KEY

  const messages = [
    { role: 'system', content: systemText },
    ...(contents || []).map((c) => ({
      role: c.role === 'user' ? 'user' : 'assistant',
      content: (c.parts || []).map((p) => p.text).join(''),
    })),
  ]

  let r
  try {
    r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`, // key stays server-side
        'X-Title': 'EqualReach Project Drafter',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        response_format: { type: 'json_object' },
      }),
    })
  } catch (err) {
    throw new GeminiError(500, 'Request to OpenRouter failed.', String(err))
  }

  if (!r.ok) {
    const detail = await r.text()
    throw new GeminiError(r.status, `OpenRouter API error (${r.status})`, detail)
  }

  const data = await r.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new GeminiError(502, 'Empty response from OpenRouter.')

  const parsed = parseLooseJson(text)
  if (parsed === undefined) {
    throw new GeminiError(502, 'Could not parse OpenRouter JSON.', text)
  }
  return parsed
}

// `openrouter/auto` can route to models that don't strictly honour
// response_format, so the JSON may come wrapped in ```json fences or with a
// little surrounding prose. Strip fences, then fall back to the outermost
// {...} block. Returns undefined if nothing parses.
function parseLooseJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return undefined
      }
    }
    return undefined
  }
}

// Provider-agnostic entry point used by every feature below. Routes to
// OpenRouter when configured, else Gemini.
function callModel(args) {
  return useOpenRouter() ? callOpenRouter(args) : callGemini(args)
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
  return callModel({
    systemText: buildChatSystemInstruction(today()),
    contents: toContents(messages),
    schema: chatResponseSchema,
    temperature: 0.1,
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

  return callModel({
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

  return callModel({
    systemText: buildSystemInstruction(today()),
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    schema: responseSchema,
  })
}
