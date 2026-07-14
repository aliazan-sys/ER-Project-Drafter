import { useEffect, useRef, useState } from 'react'
import { sendChat, generateDraftFromChat } from '../lib/api.js'
import ProjectDraftModal from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'
import { SparkleIcon, ArrowUpIcon, ReplyArrowIcon, DocIcon } from './Icons.jsx'

// Openers offered on the empty state — the four things people most often
// arrive at the drafter wanting to do.
const STARTERS = [
  'I want to create e-books',
  'Redesign our website',
  'Run a social media campaign',
  'Build a donation page',
]

export default function DraftPage() {
  const [chatKey, setChatKey] = useState(0)

  function startNewChat() {
    setChatKey((k) => k + 1)
  }

  return (
    <div className="draft-layout">
      <div className="draft-main">
        <ChatPanel key={chatKey} onNewChat={startNewChat} />
      </div>
    </div>
  )
}

function ChatPanel({ onNewChat }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('chatting') // chatting | thinking | drafting | done | error
  const [draft, setDraft] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  // Tappable answers to the question the assistant just asked.
  const [suggestions, setSuggestions] = useState([])
  const scrollRef = useRef(null)

  const busy = status === 'thinking' || status === 'drafting'
  const hasStarted = messages.some((m) => m.role === 'user')
  const textareaRef = useRef(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, 200)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden'
  }, [input])

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  async function buildDraft(convo) {
    setStatus('drafting')
    try {
      const { draft: result } = await generateDraftFromChat(convo)
      setDraft(result)
      setStatus('done')
      setModalOpen(true)
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          text: "Perfect — I have everything I need. I've drafted your project request. Review and refine it before you submit.",
        },
      ])
    } catch (err) {
      setStatus('error')
      setMessages((m) => [
        ...m,
        { role: 'bot', text: `⚠️ I couldn't generate the draft: ${err.message}` },
      ])
    }
  }

  async function sendMessage(value) {
    const convo = [...messages, { role: 'user', text: value }]
    setMessages(convo)
    setInput('')
    setSuggestions([])
    setStatus('thinking')
    setTimeout(scrollToBottom, 50)

    try {
      const { reply, readyToDraft, suggestions: next } = await sendChat(convo)
      const withReply = [...convo, { role: 'bot', text: reply }]
      setMessages(withReply)
      setTimeout(scrollToBottom, 50)
      if (readyToDraft) {
        await buildDraft(withReply)
      } else {
        setSuggestions(Array.isArray(next) ? next.slice(0, 4) : [])
        setStatus('chatting')
      }
    } catch (err) {
      setStatus('error')
      setMessages((m) => [
        ...m,
        { role: 'bot', text: `⚠️ Sorry, something went wrong: ${err.message}` },
      ])
    }
  }

  async function handleSend(e) {
    e?.preventDefault()
    const value = input.trim()
    if (!value || busy || status === 'done') return
    await sendMessage(value)
  }

  useEffect(() => {
    const prompt = localStorage.getItem('er_initial_prompt')
    if (!prompt) return
    localStorage.removeItem('er_initial_prompt')
    sendMessage(prompt)
  }, [])

  const textareaProps = {
    ref: textareaRef,
    value: input,
    rows: 1,
    onChange: (e) => setInput(e.target.value),
    onKeyDown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
  }

  return (
    <div className="chat-panel-shell">
      {!hasStarted ? (
        <div className="chat-welcome">
          <span className="drafter-badge">
            <SparkleIcon size={15} />
            AI Project Drafter
          </span>

          <h1 className="chat-welcome-title">Tell me about your project.</h1>
          <p className="chat-welcome-sub">
            Describe what you need in plain words. I'll turn it into a structured project request
            and match you to vetted teams — in under 10 minutes.
          </p>

          <form onSubmit={handleSend} className="chat-pill-form">
            <textarea
              {...textareaProps}
              placeholder={'Ask anything — e.g. "I need a new website for my nonprofit"'}
              autoFocus
            />
            <button type="submit" className="chat-pill-send" disabled={!input.trim()} aria-label="Send">
              <ArrowUpIcon />
            </button>
          </form>

          <div className="starter-chips">
            {STARTERS.map((s) => (
              <button key={s} type="button" className="starter-chip" onClick={() => sendMessage(s)}>
                <ReplyArrowIcon />
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
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
            {status === 'done' && (
              <button className="preview-cta" onClick={() => setModalOpen(true)}>
                <DocIcon />
                Preview your project draft
              </button>
            )}

            {suggestions.length > 0 && !busy && status === 'chatting' && (
              <div className="quick-replies">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="quick-reply" onClick={() => sendMessage(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSend} className="composer-inner composer-pill">
              <textarea
                {...textareaProps}
                placeholder={
                  status === 'done'
                    ? 'Draft ready — start a new draft to begin again'
                    : busy
                      ? 'One moment…'
                      : 'Describe your project, or answer the question…'
                }
                disabled={busy || status === 'done'}
              />
              {status === 'done' || status === 'error' ? (
                <button type="button" className="chat-pill-send" onClick={onNewChat} title="New chat">
                  ↺
                </button>
              ) : (
                <button
                  type="submit"
                  className="chat-pill-send"
                  disabled={!input.trim() || busy}
                  aria-label="Send"
                >
                  <ArrowUpIcon />
                </button>
              )}
            </form>
          </footer>
        </>
      )}

      {modalOpen && draft && (
        <ProjectDraftModal draft={draft} onSave={setDraft} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
