import { useEffect, useRef, useState } from 'react'
import { sendChat, generateDraftFromChat } from '../lib/api.js'
import ProjectDraftModal from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'

const GREETING =
  "Hi! I'm your EqualReach project assistant 👋  Tell me about the project you'd like to get done — in your own words is perfectly fine. I'll ask a couple of quick questions, then draft a full project request for you."

// A free-form chatbot: the user describes their project, the AI asks a few
// relevant follow-up questions (and explains anything they're unsure about),
// then drafts the full project request once it has enough detail.
export default function ChatAgent() {
  const [messages, setMessages] = useState([{ role: 'bot', text: GREETING }])
  const [input, setInput] = useState('')
  // chatting | thinking | drafting | done | error
  const [status, setStatus] = useState('chatting')
  const [draft, setDraft] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  const busy = status === 'thinking' || status === 'drafting'

  async function buildDraft(convo) {
    setStatus('drafting')
    try {
      const result = await generateDraftFromChat(convo)
      setDraft(result)
      setStatus('done')
      setModalOpen(true)
      setMessages((m) => [
        ...m,
        { role: 'bot', text: '✅ Your project request draft is ready — opening the preview now.' },
      ])
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Something went wrong.')
      setMessages((m) => [
        ...m,
        { role: 'bot', text: `⚠️ I couldn't generate the draft: ${err.message}` },
      ])
    }
  }

  async function handleSend(e) {
    e?.preventDefault()
    const value = input.trim()
    if (!value || busy || status === 'done') return

    const convo = [...messages, { role: 'user', text: value }]
    setMessages(convo)
    setInput('')
    setStatus('thinking')
    setError('')

    try {
      const { reply, readyToDraft } = await sendChat(convo)
      const withReply = [...convo, { role: 'bot', text: reply }]
      setMessages(withReply)

      if (readyToDraft) {
        await buildDraft(withReply)
      } else {
        setStatus('chatting')
      }
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Something went wrong.')
      setMessages((m) => [
        ...m,
        { role: 'bot', text: `⚠️ Sorry, something went wrong: ${err.message}` },
      ])
    }
  }

  function restart() {
    setMessages([{ role: 'bot', text: GREETING }])
    setInput('')
    setStatus('chatting')
    setDraft(null)
    setModalOpen(false)
    setError('')
  }

  return (
    <>
      <header className="topbar">
        <div className="page-head">
          <div className="page-title">AI Chatbot</div>
          <div className="page-sub">Chat through your idea — I'll ask a few questions, then draft it</div>
        </div>
      </header>

      <main className="chat" ref={scrollRef}>
        <div className="chat-inner">
          {messages.map((m, i) => (
            <Message key={i} role={m.role} text={m.text} />
          ))}
          {status === 'thinking' && <Message role="bot" text="Thinking…" typing />}
          {status === 'drafting' && <Message role="bot" text="Drafting your project…" typing />}
        </div>
      </main>

      <footer className="composer">
        <form onSubmit={handleSend} className="composer-inner">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={
              status === 'done'
                ? 'Draft ready — start a new chat to begin again'
                : busy
                  ? 'One moment…'
                  : 'Describe your project, or answer the question…'
            }
            disabled={busy || status === 'done'}
            rows={1}
          />
          {status === 'done' || status === 'error' ? (
            <button type="button" className="send" onClick={restart}>
              New chat
            </button>
          ) : (
            <button type="submit" className="send" disabled={!input.trim() || busy}>
              Send
            </button>
          )}
        </form>
        <div className="composer-hint">
          {status === 'done'
            ? 'Draft ready · reopen the preview below'
            : "Conversational mode · the assistant decides what to ask"}
        </div>
        {status === 'done' && (
          <button className="reopen" onClick={() => setModalOpen(true)}>
            Preview project draft
          </button>
        )}
      </footer>

      {modalOpen && draft && (
        <ProjectDraftModal draft={draft} onSave={setDraft} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}
