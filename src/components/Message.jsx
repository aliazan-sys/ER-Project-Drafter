export function Message({ role, text, typing }) {
  if (role === 'bot') {
    return (
      <div className="msg bot">
        {typing ? (
          <span className="typing">
            <span></span>
            <span></span>
            <span></span>
          </span>
        ) : (
          <span className="msg-bot-text">{text}</span>
        )}
      </div>
    )
  }

  return (
    <div className="msg user">
      <div className="bubble">{text}</div>
    </div>
  )
}
