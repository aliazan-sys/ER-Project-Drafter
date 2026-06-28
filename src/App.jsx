import { useEffect, useState } from 'react'
import { checkHealth } from './lib/api.js'
import GuidedDrafter from './components/GuidedDrafter.jsx'
import ChatAgent from './components/ChatAgent.jsx'
import HistoryPage from './components/HistoryPage.jsx'
import DraftPage from './components/DraftPage.jsx'

// Tiny hash router so each experience has a shareable link:
//   #/         → Guided Drafter (the original fixed-question flow)
//   #/chat     → AI Chatbot (free-form conversation)
//   #/draft    → Project Drafter (ChatGPT-style: sidebar history + chat)
//   #/history  → Saved Projects (conversations + drafts)
function routeFromHash() {
  const r = window.location.hash.replace(/^#\/?/, '')
  if (r === 'chat') return 'chat'
  if (r === 'draft') return 'draft'
  if (r === 'history') return 'history'
  return 'home'
}

// Embed mode (?embed=1) renders ONLY the chatbot, with no navbar/banner, so it
// can be dropped into an iframe (e.g. the Webflow chat-bubble widget).
const EMBED = new URLSearchParams(window.location.search).get('embed') === '1'

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

  if (EMBED) {
    return (
      <div className="app embed">
        <ChatAgent key="chat" />
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
      </div>
    </nav>
  )
}
