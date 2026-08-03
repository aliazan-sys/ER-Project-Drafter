// ---------------------------------------------------------------------------
// Shared Gemini logic — used by BOTH the local Express server (server.js, for
// `npm run dev`) and the Vercel serverless function (api/draft.js, in prod).
//
// The API key is read from process.env at call time and is NEVER sent to the
// browser. Locally it comes from .env; on Vercel it comes from the project's
// Environment Variables.
// ---------------------------------------------------------------------------

import { TIMEZONES } from './timezones.js'
import { ORG_TYPES, ORG_SIZES } from './orgProfile.js'
import { currencyForLocation } from './locationCurrency.js'
import { CATEGORIES, MAX_CATEGORIES } from './categories.js'
import { resolvePlace } from './places.js'

// Provider selection: Gemini direct by default. Now that Gemini billing is
// enabled we route through the Gemini API (no rate limiting). OpenRouter stays
// available as an opt-in fallback — set USE_OPENROUTER=1 to use it. Keys are
// read from process.env at call time; neither is ever sent to the browser.
const useOpenRouter = () =>
  process.env.USE_OPENROUTER === '1' && Boolean(process.env.OPENROUTER_API_KEY)

export const MODEL = useOpenRouter()
  ? 'google/gemini-2.5-flash'
  : process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export const hasApiKey = () =>
  useOpenRouter()
    ? Boolean(process.env.OPENROUTER_API_KEY)
    : Boolean(process.env.GEMINI_API_KEY)

// One output-token budget for every provider AND every environment, so drafts
// are never truncated differently between development and live. 16k gives full
// drafts room to complete. Override with MAX_OUTPUT_TOKENS (keep it identical
// across environments if you do).
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS) || 16384

// JSON shape we ask Gemini to return. Mirrors the 7-step EqualReach
// "Project Request" form from the reference images.
export const responseSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    // Enum-constrained, unlike orgProfile's type/size: a category is never the
    // empty string, so there is no empty enum value for Gemini to reject.
    categories: { type: 'array', items: { type: 'string', enum: CATEGORIES } },
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
    orgProfile: {
      type: 'object',
      properties: {
        submittingAs: { type: 'string' },
        name: { type: 'string' },
        // Plain strings — NOT enums — because Gemini's response schema rejects
        // an empty-string enum value, and these must be allowed to be "" when
        // the user didn't state them. The prompt constrains Type/Size to the
        // exact list values (or ""), and the client re-validates against the
        // shared ORG_TYPES / ORG_SIZES lists, so nothing off-list survives.
        type: { type: 'string' },
        size: { type: 'string' },
        industry: { type: 'string' },
        location: { type: 'string' },
      },
      required: ['submittingAs', 'name', 'type', 'size', 'industry', 'location'],
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
  required: ['title', 'categories', 'description', 'scope', 'budget', 'orgProfile'],
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
- categories: 1-${MAX_CATEGORIES} categories copied VERBATIM from this fixed list —
  never invent, reword, split, merge or abbreviate one, and never emit a value
  that is not character-for-character on it:
${CATEGORIES.map((c) => `    "${c}"`).join('\n')}
  Pick the closest available match. If nothing fits well, choose the single
  nearest category rather than coining a new one.
- skills: 3-6 concrete tools/skills (e.g. "React", "Figma", "SEO", "Copywriting").
- scope.complexity: pick Large / Medium / Small based on the ask.
- scope.startDate / completionDate: realistic EXACT calendar dates in the future
  relative to today, written as day + month + year (e.g. "14 July 2026",
  "28 September 2026"). Never use vague phrases like "Early July" or "Mid-July" —
  always commit to a specific day. Infer sensible defaults if the user didn't say.
- budget.pricingType: best fit of Per Unit / Monthly Rate / Fixed Price / Not Sure.
- budget.currency: match the submitter location: EU = EUR, UK = GBP, US = USD,
  and every other country (or no location) = USD.
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
- orgProfile: THE ONLY EXCEPTION to the "never leave blank / invent details" rule.
  Record whether the user is submitting as an individual or for an organisation,
  and otherwise fill fields ONLY from what the user EXPLICITLY stated. If the
  user did not clearly give a field, return "" (empty string) — NEVER guess.
  - orgProfile.submittingAs: exactly "Individual" or "Organisation" based on the
    user's answer to the intake question.
  - orgProfile.name: for an Organisation, its stated name; for an Individual, "".
  - If submittingAs is "Individual", set orgProfile.type to "Solo Business" and
    leave size, industry and location empty unless already explicitly supplied.
  - If submittingAs is "Organisation", populate optional Type, Size and Industry
    only when the user explicitly volunteered those details anywhere in the
    conversation. Never infer them from the organisation name, project, wording,
    or other context.
  In particular:
    * Do NOT map a vague adjective like "small", "big", or "growing" to a size —
      only fill size if the user gave an employee count or an explicit size band.
    * Do NOT treat the project's topic/subject as the industry.
    * Only fill a field if the user actually described their organisation that way.
  - orgProfile.type: "Solo Business" for an Individual. For an Organisation,
    when explicitly stated it MUST be exactly one of: ${ORG_TYPES.map((t) => `"${t}"`).join(', ')}; otherwise "".
  - orgProfile.size: when an employee count or size band is explicitly stated,
    it MUST be exactly one of: ${ORG_SIZES.map((s) => `"${s}"`).join(', ')};
    otherwise "". Never default to the first option.
  - orgProfile.industry: free text ONLY if the user stated it, else "".
  - orgProfile.location: a GEOGRAPHIC PLACE ONLY if the user stated it, else "". Write it as a real address or place name that a maps service would recognise — "London, UK", "Nairobi, Kenya", "221B Baker Street, London, UK" — never a description like "remote", "across Europe" or "our head office".
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
6. Submitter profile — whether the user is submitting as an Individual or on behalf of an Organisation; Location is required for both, and Organisation name is required for an Organisation

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
- Field 6 (submitter profile) is a short branching conversation at the end of
  intake. Never combine it into one question and never ask for organisation Type,
  Size or Industry.
  1. First ask exactly: "Are you submitting as an individual or on behalf of an organisation?"
     Return exactly ["Individual", "Organisation"] as its suggestions; this
     binary question is the exception to the general escape-hatch suggestion rule.
  2. If the user answers Individual (including "Solo Business"), ask exactly:
     "Where are you based?" Ask only once. Preserve their answer when supplied;
     if they omit or decline, leave Location empty and proceed to drafting so
     they can enter it manually in the required review field. Their draft will
     set Type to "Solo Business" automatically.
  3. If the user answers Organisation, ask exactly: "What is your organisation’s name, and where is it based?"
     This follow-up is required before drafting. Do not ask for Type, Size or Industry.
  4. Do not ask a second location question. If the Organisation user omits it in
     the name-and-location answer, leave Location empty and proceed to drafting;
     the required review field will collect it manually. Name is collected for
     the signup form. Type, Size and Industry remain optional and must not delay drafting.
  If the user volunteers Type, Size or Industry while answering any question,
  preserve those details for the draft even though you do not ask for them.
  Never set readyToDraft in the same turn that you ask either profile question.

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

Only set readyToDraft to true once the required project fields (1-4) are covered
AND the profile branch is complete: an Individual has received and answered or
declined the single location follow-up, or an Organisation has answered the single
name-and-location follow-up. When
both hold, set readyToDraft to true and reply with exactly: "Drafting your project request now."

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
          maxOutputTokens: MAX_OUTPUT_TOKENS,
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
        // Same output-token budget as the Gemini path so drafts complete
        // identically whichever provider is active.
        max_tokens: MAX_OUTPUT_TOKENS,
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

// The Location chip is a geographic address field, so the value the AI infers
// from the conversation has to clear the same bar as one the user picks from
// the dropdown. Run it through Google Places on the way out: a real place is
// rewritten to Google's canonical form ("london" -> "London, UK"), and
// something that is not a place at all ("remote", "across Europe") is dropped
// so the user fills it in properly rather than submitting prose as an address.
//
// Best-effort by design — see resolvePlace(): with no Maps key, or if the
// lookup fails, the model's original text is passed through untouched.
async function withResolvedLocation(draft) {
  const location = draft?.orgProfile?.location
  if (!location) {
    return {
      ...draft,
      budget: { ...(draft?.budget || {}), currency: 'USD' },
    }
  }
  const { value, resolved } = await resolvePlace(location)
  return {
    ...draft,
    budget: {
      ...(draft?.budget || {}),
      currency: currencyForLocation(value),
    },
    orgProfile: {
      ...draft.orgProfile,
      location: value,
      // Marks the value as one Google confirmed, which is what the Review
      // step's validation requires. Only a genuine resolution earns it: a
      // pass-through (no key / lookup failed) leaves it unset, so the user is
      // asked to pick the address themselves.
      locationVerified: resolved ? value : '',
    },
  }
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

  return withResolvedLocation(
    await callModel({
      systemText: buildSystemInstruction(today()),
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      schema: responseSchema,
    }),
  )
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

  return withResolvedLocation(
    await callModel({
      systemText: buildSystemInstruction(today()),
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      schema: responseSchema,
    }),
  )
}
