// The chatbot asks these 4 short questions, one at a time. Each answer is
// keyed by `id` and sent to the AI, which expands them into the full draft.
export const QUESTIONS = [
  {
    id: 'overview',
    text: "Hi! I'm the EqualReach Project Drafter 👋  In a sentence or two, what do you want to build or get done?",
    placeholder: 'e.g. A new website so more people donate to our youth charity…',
  },
  {
    id: 'audience_goal',
    text: 'Got it. Who is this for, and what would a successful result look like to you?',
    placeholder: 'e.g. For our small non-profit. Success = more monthly donors and a professional look.',
  },
  {
    id: 'timeline_budget',
    text: "Thanks! What's your rough timeline, and how are you thinking about budget?",
    placeholder: 'e.g. Want it live in ~3 months. Budget is flexible, maybe a fixed price around £5k.',
  },
  {
    id: 'skills_extras',
    text: 'Last one — any specific skills, tools, or must-haves I should know about?',
    placeholder: 'e.g. Should work with our existing brand colours, needs to be easy for staff to update.',
  },
]

export const INTRO_DONE_MESSAGE =
  "Perfect — that's everything I need. Give me a moment to draft your full project request…"
