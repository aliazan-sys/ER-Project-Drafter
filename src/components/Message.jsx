// A single chat bubble, shared by the guided drafter and the chatbot page.

// Four-point "sparkle" mark used for the AI avatar, matching the
// EqualReach Chat Widget design.
const Sparkle = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M12 2l2.35 6.5L21 10.8l-6.65 2.3L12 20l-2.35-6.9L3 10.8l6.65-2.3z" />
  </svg>
)

export function Message({ role, text, typing }) {
  const avatar = role === 'bot' ? <Sparkle /> : 'You'
  return (
    <div className={`msg ${role}`}>
      <div className="avatar">{avatar}</div>
      <div className="bubble">
        {typing ? (
          <span className="typing">
            <span></span>
            <span></span>
            <span></span>
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  )
}
