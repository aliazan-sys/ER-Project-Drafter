import DraftPage from './DraftPage.jsx'

// Dedicated Platform Drafter boundary. Keep platform-only behavior and styles
// scoped here; do not change the shared Website Drafter unless explicitly
// requested for both experiences.
export default function PlatformDraftPage(props) {
  return (
    <div className="platform-drafter">
      <DraftPage {...props} drafterSource="platform" />
    </div>
  )
}
