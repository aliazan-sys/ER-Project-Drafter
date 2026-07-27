// The fixed project-category pick-list, shared by the client (the Skills step's
// multi-select) and the server (so the AI can only choose from these exact
// values). Lived in ProjectDraftModal alone before, which let the draft prompt
// drift: its examples offered "Brand & Design" and "Marketing", neither of
// which is a real option, and those went straight through to the form as
// selected categories the user could not have picked themselves.
export const CATEGORIES = [
  'Writing & Translation',
  'Web Development',
  'Video & Audio',
  'Software Development',
  'Research',
  'Programming',
  'Marketing & Sales',
  'Legal',
  'Language',
  'Game Development',
  'Content Writing',
  'Engineering & Architect',
  'Education',
  'Data Processing',
  'Design & Creative',
  'Customer Service',
  'Business & Admin',
  'App Development',
  'AI/ML',
]

// Users pick at most three (enforced by the Skills step and the draft prompt).
export const MAX_CATEGORIES = 3
