import { useEffect, useState } from 'react'
import { checkHealth } from './lib/api.js'
import GuidedDrafter from './components/GuidedDrafter.jsx'
import ChatAgent from './components/ChatAgent.jsx'
import HistoryPage from './components/HistoryPage.jsx'
import DraftPage from './components/DraftPage.jsx'
import BubbleDraftPage from './components/BubbleDraftPage.jsx'
import FunnelPage from './components/FunnelPage.jsx'

// Tiny hash router so each experience has a shareable link:
//   #/         → Guided Drafter (the original fixed-question flow)
//   #/chat     → AI Chatbot (free-form conversation)
//   #/draft    → Project Drafter (ChatGPT-style: sidebar history + chat)
//   #/history  → Saved Projects (conversations + drafts)
//   #/funnel   → Funnel (how far people get in the drafter)
function routeFromHash() {
  const r = window.location.hash.replace(/^#\/?/, '')
  if (r === 'chat') return 'chat'
  if (r === 'draft') return 'draft'
  if (r === 'history') return 'history'
  if (r === 'funnel') return 'funnel'
  return 'home'
}

// ?embed=1      → chat bubble widget (existing)
// ?embed=draft  → original Project Drafter iframe for Webflow
// ?embed=bubble → separate existing-user Project Drafter for the Bubble app
const params = new URLSearchParams(window.location.search)
const EMBED = params.get('embed') === '1'
const EMBED_DRAFT = params.get('embed') === 'draft'
const EMBED_BUBBLE = params.get('embed') === 'bubble'

export default function App() {
  const [route, setRoute] = useState(routeFromHash)
  const [keyConfigured, setKeyConfigured] = useState(true)

  useEffect(() => {
    checkHealth().then((h) => setKeyConfigured(Boolean(h.keyConfigured)))
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Chat bubble widget — stripped UI for the Webflow floating button
  if (EMBED) {
    return (
      <div className="app embed">
        <ChatAgent key="chat" />
      </div>
    )
  }

  // Project Drafter iframe embed — same .app.wide wrapper as the normal
  // draft route so height: 100vh + overflow: hidden are always applied.
  if (EMBED_DRAFT) {
    return (
      <div className="app wide">
        <DraftPage key="draft-embed" />
      </div>
    )
  }

  // Bubble gets an isolated existing-user submission flow. It deliberately
  // shares the drafter UI while keeping its review CTA/auth behavior separate.
  if (EMBED_BUBBLE) {
    return (
      <div className="app wide">
        <BubbleDraftPage key="bubble-draft-embed" />
      </div>
    )
  }

  // The draft page is fully self-contained (brand lives in its sidebar),
  // so we skip the navbar and remove the 820px cap entirely for that route.
  if (route === 'draft') {
    return (
      <div className="app wide">
        {!keyConfigured && (
          <div className="banner">
            ⚠️ No Gemini API key detected. Add <code>GEMINI_API_KEY</code> to your <code>.env</code> file and
            restart the server.
          </div>
        )}
        <DraftPage key="draft" />
      </div>
    )
  }

  return (
    <div className="app">
      <Navbar route={route} />

      {!keyConfigured && (
        <div className="banner">
          ⚠️ No Gemini API key detected. Add <code>GEMINI_API_KEY</code> to your <code>.env</code> file and
          restart the server.
        </div>
      )}

      {route === 'chat' && <ChatAgent key="chat" />}
      {route === 'history' && <HistoryPage key="history" />}
      {route === 'funnel' && <FunnelPage key="funnel" />}
      {route === 'home' && <GuidedDrafter key="home" />}
    </div>
  )
}

function Navbar({ route }) {
  return (
    <nav className="navbar">
      <a className="brand" href="#/" aria-label="EqualReach home">
        <span className="brand-mark">◐</span>
        <div>
          <div className="brand-name">EqualReach</div>
          <div className="brand-sub">Project Request Drafter</div>
        </div>
      </a>
      <div className="nav-links">
        <a href="#/" className={`nav-link ${route === 'home' ? 'active' : ''}`}>
          Guided Drafter
        </a>
        <a href="#/chat" className={`nav-link ${route === 'chat' ? 'active' : ''}`}>
          AI Chatbot
        </a>
        <a href="#/draft" className={`nav-link ${route === 'draft' ? 'active' : ''}`}>
          Project Drafter
        </a>
        <a href="#/history" className={`nav-link ${route === 'history' ? 'active' : ''}`}>
          Saved Projects
        </a>
        <a href="#/funnel" className={`nav-link ${route === 'funnel' ? 'active' : ''}`}>
          Funnel
        </a>
      </div>
    </nav>
  )
}
