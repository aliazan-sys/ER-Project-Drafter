import { useEffect, useRef, useState } from 'react'
import { QUESTIONS, INTRO_DONE_MESSAGE } from '../lib/questions.js'
import { generateDraft } from '../lib/api.js'
import ProjectDraftModal from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'

// The original guided experience: a fixed set of short questions, asked one at a
// time, then expanded into a full draft.
export default function GuidedDrafter() {
  // Conversation: array of { role: 'bot' | 'user', text }
  const [messages, setMessages] = useState([{ role: 'bot', text: QUESTIONS[0].text }])
  const [step, setStep] = useState(0) // which question we're on
  const [answers, setAnswers] = useState({})
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('chatting') // chatting | drafting | done | error
  const [draft, setDraft] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  const isFinished = step >= QUESTIONS.length

  async function handleSend(e) {
    e?.preventDefault()
    const value = input.trim()
    if (!value || status !== 'chatting' || isFinished) return

    const question = QUESTIONS[step]
    const nextAnswers = { ...answers, [question.text]: value }
    const nextStep = step + 1

    const newMessages = [...messages, { role: 'user', text: value }]

    if (nextStep < QUESTIONS.length) {
      newMessages.push({ role: 'bot', text: QUESTIONS[nextStep].text })
      setMessages(newMessages)
      setAnswers(nextAnswers)
      setStep(nextStep)
      setInput('')
      return
    }

    // Last question answered -> generate the draft
    newMessages.push({ role: 'bot', text: INTRO_DONE_MESSAGE })
    setMessages(newMessages)
    setAnswers(nextAnswers)
    setStep(nextStep)
    setInput('')
    setStatus('drafting')
    setError('')

    try {
      const result = await generateDraft(nextAnswers)
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

  function restart() {
    setMessages([{ role: 'bot', text: QUESTIONS[0].text }])
    setStep(0)
    setAnswers({})
    setInput('')
    setStatus('chatting')
    setDraft(null)
    setModalOpen(false)
    setError('')
  }

  const currentPlaceholder = isFinished
    ? 'All questions answered'
    : QUESTIONS[step]?.placeholder || 'Type your answer…'

  return (
    <>
      <header className="topbar">
        <div className="page-head">
          <div className="page-title">Guided Drafter</div>
          <div className="page-sub">Answer 4 quick questions and we'll draft it</div>
        </div>
        <div className="progress">
          {QUESTIONS.map((q, i) => (
            <span key={q.id} className={`dot ${i < step ? 'filled' : ''} ${i === step ? 'active' : ''}`} />
          ))}
        </div>
      </header>

      <main className="chat" ref={scrollRef}>
        <div className="chat-inner">
          {messages.map((m, i) => (
            <Message key={i} role={m.role} text={m.text} />
          ))}
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
            placeholder={currentPlaceholder}
            disabled={status !== 'chatting' || isFinished}
            rows={1}
          />
          {status === 'done' || status === 'error' ? (
            <button type="button" className="send" onClick={restart}>
              Start over
            </button>
          ) : (
            <button type="submit" className="send" disabled={!input.trim() || status !== 'chatting'}>
              Send
            </button>
          )}
        </form>
        <div className="composer-hint">
          {status === 'done'
            ? 'Draft ready · reopen the preview below'
            : `Question ${Math.min(step + 1, QUESTIONS.length)} of ${QUESTIONS.length} · the AI fills the full form for you`}
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
