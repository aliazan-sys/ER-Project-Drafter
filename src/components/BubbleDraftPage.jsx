import DraftPage from './DraftPage.jsx'
import { conversationIdFromParams } from '../lib/platformEmbed.js'

// Existing-user clone of the AI Drafter. Keeping this as its own entry point
// prevents Bubble-only submission behavior from leaking into Webflow.
export default function BubbleDraftPage() {
  const params = new URLSearchParams(window.location.search)
  const existingUserId = (params.get('u') || '').trim()
  const existingProjectId = (params.get('p') || '').trim()
  const conversationId = conversationIdFromParams(params)

  return (
    <DraftPage
      submissionMode="bubble-existing-user"
      existingUserId={existingUserId}
      existingProjectId={existingProjectId}
      conversationId={conversationId}
    />
  )
}
