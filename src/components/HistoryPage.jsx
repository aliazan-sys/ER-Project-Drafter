import { useEffect, useState } from 'react'
import { listConversations, getConversation } from '../lib/api.js'
import ProjectDraftModal from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'

// Read-only history of every conversation + project draft the agent has saved.
export default function HistoryPage() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')

  const [selected, setSelected] = useState(null) // detail row
  const [detailLoading, setDetailLoading] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)

  useEffect(() => {
    listConversations()
      .then((rows) => {
        setItems(rows)
        setStatus('ready')
      })
      .catch((err) => {
        setError(err.message || 'Could not load history.')
        setStatus('error')
      })
  }, [])

  async function openDetail(id) {
    setDetailLoading(true)
    try {
      setSelected(await getConversation(id))
    } catch (err) {
      setError(err.message || 'Could not load that conversation.')
    } finally {
      setDetailLoading(false)
    }
  }

  // ---- Detail view -------------------------------------------------------
  if (selected) {
    const messages = Array.isArray(selected.messages) ? selected.messages : []
    return (
      <>
        <header className="topbar">
          <div className="page-head">
            <div className="page-title">{selected.title || 'Untitled project'}</div>
            <div className="page-sub">
              {modeLabel(selected.mode)} · {formatDate(selected.created_at)}
            </div>
          </div>
          <button className="reopen" onClick={() => setSelected(null)}>
            ← Back
          </button>
        </header>

        <main className="chat">
          <div className="chat-inner">
            {messages.length === 0 ? (
              <p className="muted" style={{ padding: '0 22px' }}>No transcript saved for this entry.</p>
            ) : (
              messages.map((m, i) => <Message key={i} role={m.role} text={m.text} />)
            )}
          </div>
        </main>

        <footer className="composer">
          {selected.draft ? (
            <button className="send" style={{ width: '100%' }} onClick={() => setDraftOpen(true)}>
              View full project draft
            </button>
          ) : (
            <div className="composer-hint">No draft was saved for this conversation.</div>
          )}
        </footer>

        {draftOpen && selected.draft && (
          <ProjectDraftModal draft={selected.draft} onClose={() => setDraftOpen(false)} />
        )}
      </>
    )
  }

  // ---- List view ---------------------------------------------------------
  return (
    <>
      <header className="topbar">
        <div className="page-head">
          <div className="page-title">Saved Projects</div>
          <div className="page-sub">Every conversation and draft the agent has created</div>
        </div>
        <div className="page-sub">{status === 'ready' ? `${items.length} saved` : ''}</div>
      </header>

      <main className="chat">
        <div className="history-list">
          {status === 'loading' && <p className="muted">Loading saved projects…</p>}

          {status === 'error' && <p className="muted">⚠️ {error}</p>}

          {status === 'ready' && items.length === 0 && (
            <div className="history-empty">
              <p className="strong">No saved projects yet.</p>
              <p className="muted">
                Drafts you create on the Guided Drafter or AI Chatbot pages are stored here
                automatically. If you just set up the database, create a draft and it will appear.
              </p>
            </div>
          )}

          {status === 'ready' &&
            items.map((it) => (
              <button key={it.id} className="history-card" onClick={() => openDetail(it.id)} disabled={detailLoading}>
                <div className="history-card-main">
                  <span className="history-title">{it.title || 'Untitled project'}</span>
                  <span className="history-meta">
                    {it.message_count ?? 0} messages · {formatDate(it.created_at)}
                  </span>
                </div>
                <span className={`mode-badge ${it.mode}`}>{modeLabel(it.mode)}</span>
              </button>
            ))}
        </div>
      </main>
    </>
  )
}

function modeLabel(mode) {
  return mode === 'guided' ? 'Guided' : 'Chatbot'
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
