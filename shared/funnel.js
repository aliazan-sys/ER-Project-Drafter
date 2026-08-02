// Funnel stages for the AI drafter, shared by the client (which reports them)
// and the server (which validates and ranks them). One row per conversation in
// `funnel_sessions`; its `stage` is the FURTHEST point that conversation
// reached, which is the same thing as where the user left off.
//
//   conversation — sent their first message; never got a draft
//   review       — the draft wizard opened; never reached signup
//   signup       — the signup modal opened; never submitted
//   completed    — pressed "Sign up to submit the project"
//
// Order matters: a session only ever moves forward. Going back from Review to
// the conversation to refine a draft is not a regression in the funnel, so the
// recorded stage stays put.
export const FUNNEL_STAGES = ['conversation', 'review', 'signup', 'completed']

export const isFunnelStage = (stage) => FUNNEL_STAGES.includes(stage)

// 1-based so 0 can mean "unknown" in SQL comparisons.
export const stageRank = (stage) => FUNNEL_STAGES.indexOf(stage) + 1
