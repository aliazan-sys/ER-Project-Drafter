import { useEffect, useRef, useState } from 'react'
import { sendChat, generateDraftFromChat } from '../lib/api.js'
import { startConversation, resetConversation } from '../lib/tracking.js'
import ProjectDraftModal, { REVIEW_STEP_INDEX } from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'

const GREETING =
  "Hi! I'm your EqualReach project assistant. 👋 Tell me about your project — in your own words is perfectly fine. I'll ask a few quick questions, then draft a full project request for you!"

const closeEmbed = () => window.parent?.postMessage({ type: 'er-chat-close' }, '*')

export default function ChatAgent() {
  const [messages, setMessages] = useState([{ role: 'bot', text: GREETING }])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('chatting')
  const [draft, setDraft] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [draftStep, setDraftStep] = useState(REVIEW_STEP_INDEX)
  const [draftVisited, setDraftVisited] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  const busy = status === 'thinking' || status === 'drafting'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, 120)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [input])

  useEffect(() => {
    window.parent?.postMessage({ type: modalOpen ? 'er-expand' : 'er-collapse' }, '*')
  }, [modalOpen])

  async function buildDraft(conversation) {
    setStatus('drafting')
    try {
      const { draft: result } = await generateDraftFromChat(conversation, {
        drafterSource: 'website',
      })
      setDraft(result)
      setDraftStep(REVIEW_STEP_INDEX)
      setDraftVisited([])
      setStatus('done')
      setModalOpen(true)
      setMessages((current) => [
        ...current,
        { role: 'bot', text: '✅ Your project request draft is ready — opening the preview now.' },
      ])
    } catch (error) {
      setStatus('error')
      setMessages((current) => [
        ...current,
        { role: 'bot', text: `⚠️ I couldn't generate the draft: ${error.message}` },
      ])
    }
  }

  async function sendMessage(value) {
    startConversation('website')
    const conversation = [...messages, { role: 'user', text: value }]
    setMessages(conversation)
    setInput('')
    setSuggestions([])
    setStatus('thinking')

    try {
      const { reply, readyToDraft, suggestions: next } = await sendChat(conversation, {
        drafterSource: 'website',
      })
      const withReply = [...conversation, { role: 'bot', text: reply }]
      setMessages(withReply)

      if (readyToDraft) {
        await buildDraft(withReply)
      } else {
        setSuggestions(Array.isArray(next) ? next.slice(0, 4) : [])
        setStatus('chatting')
      }
    } catch (error) {
      setStatus('error')
      setMessages((current) => [
        ...current,
        { role: 'bot', text: `⚠️ Sorry, something went wrong: ${error.message}` },
      ])
    }
  }

  async function handleSend(event) {
    event?.preventDefault()
    const value = input.trim()
    if (!value || busy || status === 'done') return
    await sendMessage(value)
  }

  function restart() {
    resetConversation()
    setMessages([{ role: 'bot', text: GREETING }])
    setInput('')
    setStatus('chatting')
    setDraft(null)
    setModalOpen(false)
    setDraftStep(REVIEW_STEP_INDEX)
    setDraftVisited([])
    setSuggestions([])
  }

  return (
    <>
      <header className="er-head">
        <div className="er-head-id">
          <span className="er-head-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2l2.35 6.5L21 10.8l-6.65 2.3L12 20l-2.35-6.9L3 10.8l6.65-2.3z" />
            </svg>
          </span>
          <div>
            <p className="er-head-name">EqualReach</p>
            <p className="er-head-sub">Project Drafter</p>
          </div>
        </div>
        <button className="er-head-close" type="button" onClick={closeEmbed} aria-label="Close chat">
          ✕
        </button>
      </header>

      <main className="chat" ref={scrollRef}>
        <div className="chat-inner">
          {messages.map((message, index) => (
            <Message key={index} role={message.role} text={message.text} />
          ))}
          {status === 'thinking' && <Message role="bot" text="Thinking…" typing />}
          {status === 'drafting' && <Message role="bot" text="Drafting your project…" typing />}
        </div>
      </main>

      <footer className="composer">
        {suggestions.length > 0 && !busy && status === 'chatting' && (
          <div className="quick-replies">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="quick-reply"
                onClick={() => sendMessage(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSend} className="composer-inner composer-pill">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
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
            <button type="button" className="chat-pill-send" onClick={restart} title="New chat">
              ↺
            </button>
          ) : (
            <button
              type="submit"
              className="chat-pill-send"
              disabled={!input.trim() || busy}
              aria-label="Send"
            >
              ↑
            </button>
          )}
        </form>
        <div className="composer-hint">
          {status === 'done'
            ? 'Draft ready · reopen the preview below'
            : 'Conversational mode · the assistant decides what to ask'}
        </div>
        {status === 'done' && (
          <button className="reopen" type="button" onClick={() => setModalOpen(true)}>
            Preview project draft
          </button>
        )}
      </footer>

      {modalOpen && draft && (
        <ProjectDraftModal
          draft={draft}
          drafterSource="website"
          onSave={setDraft}
          initialStep={draftStep}
          onStepChange={setDraftStep}
          initialVisited={draftVisited}
          onVisitedChange={setDraftVisited}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
