import { useEffect, useRef, useState } from 'react'
import { sendChat, generateDraftFromChat, listConversations, getConversation } from '../lib/api.js'
import ProjectDraftModal from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'

const GREETING =
  "Hi! I'm your EqualReach project assistant. Tell me about the project you'd like to get done — in your own words is perfectly fine. I'll ask a couple of quick questions, then draft a full project request for you."

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// ChatGPT / Claude-style two-panel layout:
//   Left  → scrollable history sidebar (past drafts)
//   Right → active chat panel (new draft) or read-only transcript (history selected)
export default function DraftPage() {
  const [history, setHistory] = useState([])
  const [historyStatus, setHistoryStatus] = useState('loading')

  // which history item is open (null = new chat)
  const [activeId, setActiveId] = useState(null)
  const [activeConvo, setActiveConvo] = useState(null)
  const [convoLoading, setConvoLoading] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)

  // increment to force-remount the ChatPanel with fresh state
  const [chatKey, setChatKey] = useState(0)

  useEffect(() => {
    refreshHistory()
  }, [])

  function refreshHistory() {
    listConversations()
      .then((rows) => { setHistory(rows); setHistoryStatus('ready') })
      .catch(() => setHistoryStatus('error'))
  }

  async function openConvo(id) {
    if (id === activeId && activeConvo) return
    setActiveId(id)
    setActiveConvo(null)
    setDraftOpen(false)
    setConvoLoading(true)
    try {
      const convo = await getConversation(id)
      setActiveConvo(convo)
    } catch {
      setActiveId(null)
    } finally {
      setConvoLoading(false)
    }
  }

  function startNewChat() {
    setActiveId(null)
    setActiveConvo(null)
    setDraftOpen(false)
    setChatKey((k) => k + 1)
  }

  function handleDraftSaved() {
    refreshHistory()
  }

  return (
    <div className="draft-layout">
      {/* ── Left sidebar ── */}
      <aside className="draft-sidebar">
        <div className="draft-sidebar-top">
          <button className="new-draft-btn" onClick={startNewChat}>
            <span className="new-draft-icon" aria-hidden="true">＋</span>
            New Draft
          </button>
        </div>

        <div className="draft-history-list">
          {historyStatus === 'loading' && (
            <p className="draft-history-muted">Loading…</p>
          )}
          {historyStatus === 'error' && (
            <p className="draft-history-muted">⚠️ Could not load history</p>
          )}
          {historyStatus === 'ready' && history.length === 0 && (
            <p className="draft-history-muted">No drafts yet — start a new conversation above.</p>
          )}
          {historyStatus === 'ready' &&
            history.map((item) => (
              <button
                key={item.id}
                className={`draft-history-item ${activeId === item.id ? 'active' : ''}`}
                onClick={() => openConvo(item.id)}
              >
                <span className="draft-history-title">
                  {item.title || 'Untitled project'}
                </span>
                <span className="draft-history-date">{formatDate(item.created_at)}</span>
              </button>
            ))}
        </div>
      </aside>

      {/* ── Right panel ── */}
      <div className="draft-main">
        {activeId === null ? (
          <ChatPanel
            key={chatKey}
            onDraftSaved={handleDraftSaved}
            onNewChat={startNewChat}
          />
        ) : (
          <ConvoPanel
            loading={convoLoading}
            convo={activeConvo}
            draftOpen={draftOpen}
            onDraftOpen={setDraftOpen}
            onNewChat={startNewChat}
          />
        )}
      </div>
    </div>
  )
}

// ── New chat panel (mirrors ChatAgent logic, embedded inline) ──────────────
function ChatPanel({ onDraftSaved, onNewChat }) {
  const [messages, setMessages] = useState([{ role: 'bot', text: GREETING }])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('chatting') // chatting | thinking | drafting | done | error
  const [draft, setDraft] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  const busy = status === 'thinking' || status === 'drafting'

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
      onDraftSaved?.()
    } catch (err) {
      setStatus('error')
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

    try {
      const { reply, readyToDraft } = await sendChat(convo)
      const withReply = [...convo, { role: 'bot', text: reply }]
      setMessages(withReply)
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

  return (
    <>
      <header className="draft-panel-head">
        <div className="draft-panel-title">New Project Draft</div>
        <div className="draft-panel-sub">
          Chat with the AI to describe your project — it will generate a full draft request
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
                ? 'Draft ready — start a new draft to begin again'
                : busy
                  ? 'One moment…'
                  : 'Describe your project, or answer the question…'
            }
            disabled={busy || status === 'done'}
            rows={1}
          />
          {status === 'done' || status === 'error' ? (
            <button type="button" className="send" onClick={onNewChat}>
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
            ? 'Draft saved · reopen the preview or start a new draft'
            : 'Conversational mode · the assistant decides what to ask'}
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

// ── Read-only conversation view (a past draft selected from the sidebar) ───
function ConvoPanel({ loading, convo, draftOpen, onDraftOpen, onNewChat }) {
  const scrollRef = useRef(null)
  const messages = Array.isArray(convo?.messages) ? convo.messages : []

  useEffect(() => {
    if (!loading) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [loading, messages.length])

  return (
    <>
      <header className="draft-panel-head">
        <div className="draft-panel-head-row">
          <div>
            <div className="draft-panel-title">
              {loading ? 'Loading…' : convo?.title || 'Untitled project'}
            </div>
            {convo?.created_at && (
              <div className="draft-panel-sub">{formatDate(convo.created_at)}</div>
            )}
          </div>
          <button className="draft-new-btn" onClick={onNewChat}>
            + New Draft
          </button>
        </div>
      </header>

      <main className="chat" ref={scrollRef}>
        <div className="chat-inner">
          {loading ? (
            <p className="muted" style={{ padding: '0 22px' }}>Loading conversation…</p>
          ) : messages.length === 0 ? (
            <p className="muted" style={{ padding: '0 22px' }}>No transcript saved for this entry.</p>
          ) : (
            messages.map((m, i) => <Message key={i} role={m.role} text={m.text} />)
          )}
        </div>
      </main>

      <footer className="composer">
        {!loading && convo?.draft ? (
          <button className="send" style={{ width: '100%' }} onClick={() => onDraftOpen(true)}>
            View project draft
          </button>
        ) : !loading ? (
          <div className="composer-hint">No draft was saved for this conversation.</div>
        ) : null}
      </footer>

      {draftOpen && convo?.draft && (
        <ProjectDraftModal draft={convo.draft} onClose={() => onDraftOpen(false)} />
      )}
    </>
  )
}
