import DraftPage from './DraftPage.jsx'

// Existing-user clone of the AI Drafter. Keeping this as its own entry point
// prevents Bubble-only submission behavior from leaking into Webflow.
export default function BubbleDraftPage() {
  const params = new URLSearchParams(window.location.search)
  const existingUserId = (params.get('u') || '').trim()

  return (
    <DraftPage
      submissionMode="bubble-existing-user"
      existingUserId={existingUserId}
    />
  )
}
