import { useEffect, useRef, useState } from 'react'
import {
  attachPlatformConversation,
  fetchPlatformConversation,
  generateDrafterToken,
  generateDraftFromChat,
  savePlatformConversation,
  sendChat,
  syncPlatformDraftToBubble,
} from '../lib/api.js'
import { getConversationSessionId, startConversation, resetConversation } from '../lib/tracking.js'
import ProjectDraftModal, { REVIEW_STEP_INDEX } from './ProjectDraftModal.jsx'
import { Message } from './Message.jsx'
import { SparkleIcon, ArrowUpIcon, ReplyArrowIcon, DocIcon } from './Icons.jsx'
import { bubbleAppUrl } from '../lib/bubbleConfig.js'
import { suggestionsFromMessages } from '../lib/platformEmbed.js'

const SERVICES_URL = bubbleAppUrl('/marketplace/services')

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

export default function DraftPage({
  submissionMode = 'public',
  existingUserId = '',
  existingProjectId = '',
  conversationId = '',
  drafterSource = 'website',
}) {
  const [chatKey, setChatKey] = useState(0)

  function startNewChat() {
    // Close the funnel session first: the next conversation is a new one, and
    // should be counted separately rather than extending the abandoned one.
    resetConversation()
    setChatKey((k) => k + 1)
  }

  return (
    <div className="draft-layout">
      <div className="draft-main">
        <ChatPanel
          key={chatKey}
          onNewChat={startNewChat}
          submissionMode={submissionMode}
          existingUserId={existingUserId}
          existingProjectId={existingProjectId}
          conversationId={conversationId}
          drafterSource={drafterSource}
        />
      </div>
    </div>
  )
}

function ChatPanel({
  onNewChat,
  submissionMode,
  existingUserId,
  existingProjectId,
  conversationId,
  drafterSource,
}) {
  const skipOrgProfile = submissionMode === 'bubble-existing-user'
  const isPlatformEmbed = drafterSource === 'platform' && skipOrgProfile
  const initialPromptFromQuery = (
    new URLSearchParams(window.location.search).get('initial_prompt') || ''
  ).trim().slice(0, 2000)
  const showBackToServices = drafterSource === 'website' && Boolean(initialPromptFromQuery)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [smallScreen, setSmallScreen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  )
  const [status, setStatus] = useState('chatting') // chatting | thinking | drafting | done | error
  const [draft, setDraft] = useState(null)
  const [restoring, setRestoring] = useState(() => Boolean(
    isPlatformEmbed && conversationId && existingUserId && existingProjectId,
  ))
  const [modalOpen, setModalOpen] = useState(false)
  // Lives out here so closing and reopening the wizard resumes where they left
  // off — the modal itself unmounts and would forget. Starts on Review: the
  // draft is already complete, so the first thing to do is check it over.
  const [draftStep, setDraftStep] = useState(REVIEW_STEP_INDEX)
  // Same reason: completed-step checkmarks must survive the modal unmounting.
  const [draftVisited, setDraftVisited] = useState([])
  // True between "Refine with AI" and the redraft that answers it, so the next
  // message goes straight to redrafting instead of another round of questions.
  const [refining, setRefining] = useState(false)
  // Tappable answers to the question the assistant just asked.
  const [suggestions, setSuggestions] = useState([])
  const scrollRef = useRef(null)
  const initialPromptSentRef = useRef(false)
  const aiDrafterTokenRef = useRef('')
  if (isPlatformEmbed && !aiDrafterTokenRef.current) {
    aiDrafterTokenRef.current = generateDrafterToken()
  }

  const busy = status === 'thinking' || status === 'drafting'
  const hasStarted = messages.some((m) => m.role === 'user')
  const textareaRef = useRef(null)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setSmallScreen(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = smallScreen && !hasStarted ? 144 : 200
    const next = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [input, smallScreen, hasStarted])

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  async function syncPlatformDraft(result, id) {
    await syncPlatformDraftToBubble({
      u: existingUserId,
      p: existingProjectId,
      conversationId: id,
      draft: result,
      aiDrafterToken: aiDrafterTokenRef.current,
    })
  }

  async function buildDraft(convo, doneText) {
    setStatus('drafting')
    try {
      const { draft: result, id } = await generateDraftFromChat(convo, {
        skipOrgProfile,
        drafterSource,
        funnelSessionId: getConversationSessionId(),
        ...(isPlatformEmbed ? { u: existingUserId, p: existingProjectId } : {}),
      })
      setDraft(result)
      // Fresh content — the old position no longer means anything, so open on
      // Review. Every new draft (first pass or a refine) lands there, with the
      // earlier steps already ticked off.
      setDraftStep(REVIEW_STEP_INDEX)
      setDraftVisited([])
      setStatus('done')
      if (!isPlatformEmbed) setModalOpen(true)
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          text:
            doneText ||
            "Perfect — I have everything I need. I've drafted your project request. Review and refine it before you submit.",
        },
      ])
      if (isPlatformEmbed) {
        try {
          await syncPlatformDraft(result, id)
          navigateToBubbleProject()
          return
        } catch (syncError) {
          setMessages((m) => [
            ...m,
            {
              role: 'bot',
              text: `Your draft is saved. EqualReach could not update the project yet (${syncError.message}); reopening this page will retry.`,
            },
          ])
        }
      }
    } catch (err) {
      setStatus('error')
      setMessages((m) => [
        ...m,
        { role: 'bot', text: `⚠️ I couldn't generate the draft: ${err.message}` },
      ])
    }
  }

  function navigateToBubbleProject() {
    const url = bubbleAppUrl(`/client/project-request/${encodeURIComponent(existingProjectId)}`)
    if (window.self === window.top) {
      window.location.assign(url)
      return
    }
    try {
      window.top.location.href = url
    } catch {
      // If the iframe cannot navigate the top-level page, let the host handle it.
    }
    window.parent.postMessage({ type: 'er-navigate', url }, '*')
  }

  async function sendMessage(value) {
    // First message of a conversation starts a funnel session; later calls
    // are no-ops. Refining an existing draft therefore stays the same session.
    startConversation(drafterSource)
    const convo = [...messages, { role: 'user', text: value }]
    setMessages(convo)
    setInput('')
    setSuggestions([])
    setStatus('thinking')
    setTimeout(scrollToBottom, 50)

    try {
      if (isPlatformEmbed) {
        if (!existingUserId || !existingProjectId) {
          throw new Error('The Bubble user ID or project ID is missing from the Platform Drafter URL.')
        }
        const saved = await savePlatformConversation({
          u: existingUserId,
          p: existingProjectId,
          messages: convo,
          funnelSessionId: getConversationSessionId(),
        })
        if (saved?.id) {
          if (saved.bubble_sync_status !== 'synced') {
            try {
              await attachPlatformConversation({
                u: existingUserId,
                p: existingProjectId,
                conversationId: saved.id,
                aiDrafterToken: aiDrafterTokenRef.current,
              })
            } catch (syncError) {
              console.warn('[platform-drafter] initial Bubble conversation link failed:', syncError.message)
            }
          }
        }
      }
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

      const { reply, readyToDraft, suggestions: next } = await sendChat(convo, {
        skipOrgProfile,
        drafterSource,
      })
      const replySuggestions = Array.isArray(next) ? next.slice(0, 4) : []
      const withReply = [...convo, { role: 'bot', text: reply, suggestions: replySuggestions }]
      setMessages(withReply)
      if (isPlatformEmbed) {
        await savePlatformConversation({
          u: existingUserId,
          p: existingProjectId,
          messages: withReply,
          funnelSessionId: getConversationSessionId(),
        })
      }
      setTimeout(scrollToBottom, 50)
      if (readyToDraft) {
        await buildDraft(withReply)
      } else {
        setSuggestions(replySuggestions)
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

  function backToServices() {
    if (window.top === window) {
      window.location.assign(SERVICES_URL)
      return
    }
    window.open(SERVICES_URL, '_top')
  }

  useEffect(() => {
    if (!isPlatformEmbed || !conversationId || !existingUserId || !existingProjectId) {
      setRestoring(false)
      return undefined
    }
    let live = true
    fetchPlatformConversation({
      u: existingUserId,
      p: existingProjectId,
      id: conversationId,
    })
      .then(async (conversation) => {
        if (!live || !conversation) return
        const restoredMessages = Array.isArray(conversation.messages) ? conversation.messages : []
        setMessages(restoredMessages)
        setSuggestions(
          conversation.status === 'completed' ? [] : suggestionsFromMessages(restoredMessages),
        )
        if (conversation.draft) setDraft(conversation.draft)
        setStatus(conversation.status === 'completed' ? 'done' : 'chatting')
        if (conversation.status !== 'completed' && conversation.bubble_sync_status !== 'synced') {
          try {
            await attachPlatformConversation({
              u: existingUserId,
              p: existingProjectId,
              conversationId: conversation.id,
              aiDrafterToken: aiDrafterTokenRef.current,
            })
          } catch (syncError) {
            setMessages((items) => [
              ...items,
              { role: 'bot', text: `Your conversation is saved, but Bubble could not link it to this project yet (${syncError.message}). It will retry next time you open the drafter.` },
            ])
          }
        } else if (
          conversation.status === 'completed' &&
          conversation.draft &&
          conversation.bubble_sync_status !== 'synced'
        ) {
          try {
            await syncPlatformDraft(conversation.draft, conversation.id)
          } catch (syncError) {
            setMessages((items) => [
              ...items,
              {
                role: 'bot',
                text: `This conversation is complete and read-only. The project update will retry when this page is reopened (${syncError.message}).`,
              },
            ])
          }
        }
      })
      .catch((err) => {
        if (!live) return
        setStatus('error')
        setMessages([{ role: 'bot', text: `Unable to restore this conversation: ${err.message}` }])
      })
      .finally(() => { if (live) setRestoring(false) })
    return () => { live = false }
  }, [isPlatformEmbed, existingUserId, existingProjectId, conversationId])

  useEffect(() => {
    if (initialPromptSentRef.current) return
    if (restoring) return
    const storedPrompt = localStorage.getItem('er_initial_prompt')?.trim()
    const prompt = initialPromptFromQuery || (storedPrompt || '').slice(0, 2000)
    if (!prompt) return
    initialPromptSentRef.current = true
    localStorage.removeItem('er_initial_prompt')
    sendMessage(prompt)
  }, [restoring])

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
      {showBackToServices && (
        <button className="website-drafter-return" type="button" onClick={backToServices}>
          <span aria-hidden="true">←</span>
          Back to services
        </button>
      )}
      {restoring ? (
        <div className="conversation-loader" role="status" aria-live="polite">
          <span className="conversation-loader-spinner" aria-hidden="true" />
          <span>Loading conversation</span>
        </div>
      ) : !hasStarted ? (
        <div className="chat-welcome">
          <span className="drafter-badge">
            <SparkleIcon size={15} />
            AI Project Drafter
          </span>

          <h1 className="chat-welcome-title">Tell me about your project.</h1>
          <p className="chat-welcome-sub">
            Describe what you need in plain words. I'll turn it into a structured project brief (in
            less than 3 minutes!) so we can match you to vetted teams.
          </p>

          <form onSubmit={handleSend} className="chat-pill-form">
            <textarea
              {...textareaProps}
              placeholder={
                smallScreen
                  ? 'Describe your project…'
                  : 'Ask anything — e.g. "I need a new website for my nonprofit"'
              }
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
            {draft && !busy && !isPlatformEmbed && (
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

            {isPlatformEmbed && status === 'done' ? (
              <p className="composer-hint">This conversation is complete and available for review only.</p>
            ) : (
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
            )}
          </footer>
        </>
      )}

      {!isPlatformEmbed && modalOpen && draft && (
        <ProjectDraftModal
          draft={draft}
          submissionMode={submissionMode}
          existingUserId={existingUserId}
          drafterSource={drafterSource}
          onSave={setDraft}
          onRefine={refineWithAI}
          initialStep={draftStep}
          onStepChange={setDraftStep}
          initialVisited={draftVisited}
          onVisitedChange={setDraftVisited}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
