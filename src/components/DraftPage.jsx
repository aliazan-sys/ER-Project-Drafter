import { useEffect, useRef, useState } from 'react'
import { sendChat, generateDraftFromChat } from '../lib/api.js'
import ProjectDraftModal from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'
import { SparkleIcon, ArrowUpIcon, ReplyArrowIcon, DocIcon } from './Icons.jsx'

// Openers offered on the empty state — the things people most often arrive at
// the drafter wanting to do. Order is priority order: the narrow-screen rule in
// .starter-chips drops from the end, so keep the strongest four first.
const STARTERS = [
  'Edit my videos',
  'Redesign my website',
  'Manage my social media',
  'Graphic design support',
  'I need a virtual assistant',
  'AI annotation & labelling',
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
  // Lives out here so closing and reopening the wizard resumes where they left
  // off — the modal itself unmounts and would forget.
  const [draftStep, setDraftStep] = useState(0)
  // True between "Refine with AI" and the redraft that answers it, so the next
  // message goes straight to redrafting instead of another round of questions.
  const [refining, setRefining] = useState(false)
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

  async function buildDraft(convo, doneText) {
    setStatus('drafting')
    try {
      const { draft: result } = await generateDraftFromChat(convo)
      setDraft(result)
      // Fresh content — the old position no longer means anything, so start at
      // Title. Every new draft (first pass or a refine) lands here.
      setDraftStep(0)
      setStatus('done')
      setModalOpen(true)
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          text:
            doneText ||
            "Perfect — I have everything I need. I've drafted your project request. Review and refine it before you submit.",
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
      // Answering "what would you like to change?" — acknowledge, then redraft
      // straight away rather than re-interviewing them.
      if (refining) {
        const withReply = [...convo, { role: 'bot', text: 'Refining your project request now' }]
        setMessages(withReply)
        setTimeout(scrollToBottom, 50)
        await buildDraft(
          withReply,
          "All done — I've updated your project request with those changes. Have a look.",
        )
        setRefining(false)
        return
      }

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
      setRefining(false)
      setMessages((m) => [
        ...m,
        { role: 'bot', text: `⚠️ Sorry, something went wrong: ${err.message}` },
      ])
    }
  }

  // Back to the conversation from the draft wizard. The composer is locked once
  // a draft exists (status 'done'), so reopen it and invite the change.
  function refineWithAI() {
    setModalOpen(false)
    setStatus('chatting')
    setRefining(true)
    setSuggestions([])
    setMessages((m) => [
      ...m,
      {
        role: 'bot',
        text: "Sure — what would you like to change? Tell me what to adjust and I'll update your draft.",
      },
    ])
    setTimeout(() => {
      scrollToBottom()
      textareaRef.current?.focus()
    }, 50)
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
            Describe what you need in plain words. I'll turn it into a structured project brief (in
            less than 2 minutes!) so we can match you to vetted teams.
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
              {status === 'thinking' && !refining && <Message role="bot" text="Thinking…" typing />}
              {status === 'drafting' && !refining && (
                <Message role="bot" text="Drafting your project…" typing />
              )}
            </div>
          </main>

          <footer className="composer">
            {draft && !busy && (
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
        <ProjectDraftModal
          draft={draft}
          onSave={setDraft}
          onRefine={refineWithAI}
          initialStep={draftStep}
          onStepChange={setDraftStep}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
