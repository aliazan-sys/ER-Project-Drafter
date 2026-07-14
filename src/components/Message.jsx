import { SparkleIcon } from './Icons.jsx'

export function Message({ role, text, typing }) {
  if (role === 'bot') {
    return (
      <div className="msg bot">
        <span className="bot-avatar" aria-hidden="true">
          <SparkleIcon size={15} />
        </span>
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
