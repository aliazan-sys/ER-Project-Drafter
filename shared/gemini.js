// ---------------------------------------------------------------------------
// Shared Gemini logic — used by BOTH the local Express server (server.js, for
// `npm run dev`) and the Vercel serverless function (api/draft.js, in prod).
//
// The API key is read from process.env at call time and is NEVER sent to the
// browser. Locally it comes from .env; on Vercel it comes from the project's
// Environment Variables.
// ---------------------------------------------------------------------------

import { TIMEZONES } from './timezones.js'

// Provider selection: use OpenRouter when its key is present, otherwise fall
// back to Gemini. To force Gemini even when an OpenRouter key exists, set
// USE_OPENROUTER=0. Keys are read from process.env at call time; neither is
// ever sent to the browser.
const useOpenRouter = () =>
  process.env.USE_OPENROUTER !== '0' && Boolean(process.env.OPENROUTER_API_KEY)

// TEMPORARY PIN: force a fixed, strong OpenRouter model instead of honouring
// OPENROUTER_MODEL. Live had OPENROUTER_MODEL=openrouter/auto, which routes each
// request to whatever (often weaker) model OpenRouter picks — those models fail
// to track intake state and repeat questions. Pinning to google/gemini-2.5-flash
// makes live behave like local. To revert, restore the env-var read below and/or
// set OPENROUTER_MODEL in the Vercel dashboard.
export const MODEL = useOpenRouter()
  ? 'google/gemini-2.5-flash'
  : process.env.GEMINI_MODEL || 'gemini-2.0-flash'

export const hasApiKey = () =>
  useOpenRouter()
    ? Boolean(process.env.OPENROUTER_API_KEY)
    : Boolean(process.env.GEMINI_API_KEY)

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
        estimatedCostFrom: { type: 'string' },
        estimatedCostTo: { type: 'string' },
        costEstimated: { type: 'boolean' },
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
        timezone: { type: 'array', items: { type: 'string', enum: TIMEZONES } },
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
- scope.startDate / completionDate: realistic EXACT calendar dates in the future
  relative to today, written as day + month + year (e.g. "14 July 2026",
  "28 September 2026"). Never use vague phrases like "Early July" or "Mid-July" —
  always commit to a specific day. Infer sensible defaults if the user didn't say.
- budget.pricingType: best fit of Per Unit / Monthly Rate / Fixed Price / Not Sure.
- budget.currency: default "GBP" unless the user implies otherwise.
- budget.estimatedCostFrom / budget.estimatedCostTo: the lower and upper bounds
  of a realistic cost range, each with the currency symbol (e.g. "£4,500" and
  "£5,500"). estimatedCostTo must be greater than or equal to estimatedCostFrom.
  If the user gives a single exact figure, turn it into a range by spreading
  around it rather than repeating the same number: normally ±50 (e.g. "400 USD"
  -> From 350 To 450). For small budgets where ±50 would be too wide relative to
  the amount, use a tighter spread of about ±20 (e.g. "60 USD" -> From 40 To 80).
  Never let estimatedCostFrom go below zero — clamp the lower bound at 0.
- budget.costEstimated: set to true when the user did NOT give any price figure and
  you had to estimate the cost range yourself from typical market rates. Set to false
  when the range is based on a figure the user actually provided.
- description: 2-4 rich paragraphs covering deliverables, success criteria,
  collaboration style and scope clarity (this is the meatiest field).
- existingAssets: what the client likely already has, or "None specified" if truly none.
- projectGoals.impactGoal: the successful-outcome statement in the user's voice.
- projectGoals.impactDescription: the longer-run organisational/social impact.
- orgProfile: infer type (e.g. Non-profit, Startup), size, industry and location.
- screeningQuestions: 2-3 sharp questions to vet partners.
- levelOfExperience: Entry / Intermediate / Expert.
- advancedTerms.languages: e.g. ["English"].
- advancedTerms.timezone: a LIST of timezones, each copied verbatim from the allowed list — never invent or reword one.
  Usually a single entry, inferred from the client's location; add more only if the project clearly spans regions.
  If the location is unknown, use ["(UTC+00:00) Dublin, Edinburgh, Lisbon, London"].

Return ONLY the structured JSON. Be specific and concrete — invent reasonable,
professional details where the user was vague.`

// ---------------------------------------------------------------------------
// Conversational "chatbot" mode
// ---------------------------------------------------------------------------

// What the chat turn returns: a short conversational reply, a flag the agent
// flips once it has gathered enough to write a solid draft, and a few tappable
// answers the UI renders as quick-reply chips above the composer.
export const chatResponseSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    readyToDraft: { type: 'boolean' },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['reply', 'readyToDraft', 'suggestions'],
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
- A single user message can answer several fields (or several parts of one field) at once. Decompose it fully and mark every part it covers before deciding what to ask next.
- Budget has two parts — the amount AND the pricing type. Infer the pricing type from how the amount is phrased and do NOT ask about it separately when the phrasing already makes it clear:
  - "per month", "monthly", "a month", "/mo", "retainer" -> Monthly Rate
  - "per hour", "per day", "per unit", "per item", "each", "hourly" -> Per Unit
  - "total", "in total", "one-off", "fixed", "flat" or a lone lump sum -> Fixed Price
  Only ask about pricing type if the amount is given with no wording that implies one. When you do ask about pricing type, always list the options in parentheses, e.g. "What pricing structure works best for you (per unit, monthly rate, fixed price, or not sure)?" — a user would not otherwise know which pricing structures are available.
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

Example — if the user says "my budget is 400 USD monthly":
This answers both the amount (400 USD) and the pricing type (Monthly Rate), so do NOT ask about pricing type.
WRONG: "What pricing type would you prefer — per unit, monthly, or fixed?"
RIGHT: (move on to the next missing field, e.g.) "What does a successful outcome look like for this project?"

SUGGESTIONS — alongside the question, return 2-4 plausible answers to it that the user can tap instead of typing.
- Each is a direct answer to the question you just asked, written in the user's voice, not yours.
- Keep them to 1-4 words so they fit on a chip: "Financial literacy", "£3,000 - £5,000", "Monthly rate".
- Make them genuinely different from each other, and tailor them to this project — never generic filler.
- The last one should always be an escape hatch such as "Not sure yet" when the question is one a user could reasonably not have decided on.
- When readyToDraft is true, return an empty suggestions array.

Once all required fields are collected, set readyToDraft to true and reply with exactly: "Drafting your project request now."

Never write the draft itself here. Always reply as JSON { reply, readyToDraft, suggestions }.`

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
        // Cap the completion window. Without this, OpenRouter reserves the
        // model's full max output (65k tokens), which can exceed a low-credit
        // account's balance and 402s. 16k gives full drafts room to complete
        // while staying well under that ceiling. Override with OPENROUTER_MAX_TOKENS.
        max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS) || 16384,
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
