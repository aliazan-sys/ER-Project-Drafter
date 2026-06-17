// A single chat bubble, shared by the guided drafter and the chatbot page.
export function Message({ role, text, typing }) {
  return (
    <div className={`msg ${role}`}>
      <div className="avatar">{role === 'bot' ? '◐' : 'You'}</div>
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
