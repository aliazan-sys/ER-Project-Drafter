import { useEffect, useRef, useState } from 'react'
import { sendChat, generateDraftFromChat } from '../lib/api.js'
import ProjectDraftModal from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'

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
        { role: 'bot', text: '✅ Your project request draft is ready — opening the preview now.' },
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
    setStatus('thinking')
    setTimeout(scrollToBottom, 50)

    try {
      const { reply, readyToDraft } = await sendChat(convo)
      const withReply = [...convo, { role: 'bot', text: reply }]
      setMessages(withReply)
      setTimeout(scrollToBottom, 50)
      if (readyToDraft) await buildDraft(withReply)
      else setStatus('chatting')
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
          <h1 className="chat-welcome-title">Tell me about your project.</h1>
          <form onSubmit={handleSend} className="chat-pill-form">
            <textarea
              {...textareaProps}
              placeholder="Ask anything"
              autoFocus
            />
            <button type="submit" className="chat-pill-send" disabled={!input.trim()}>
              ↑
            </button>
          </form>
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
                <button type="submit" className="chat-pill-send" disabled={!input.trim() || busy}>
                  ↑
                </button>
              )}
            </form>
            <div className="composer-hint">
              {status === 'done'
                ? 'Draft saved · reopen the preview or start a new draft'
                : 'AI may make mistakes — review important details'}
            </div>
            {status === 'done' && (
              <button className="reopen" onClick={() => setModalOpen(true)}>
                Preview project draft
              </button>
            )}
          </footer>
        </>
      )}

      {modalOpen && draft && (
        <ProjectDraftModal draft={draft} onSave={setDraft} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
