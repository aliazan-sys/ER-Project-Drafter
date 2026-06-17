import { useEffect, useState } from 'react'
import { checkHealth } from './lib/api.js'
import GuidedDrafter from './components/GuidedDrafter.jsx'
import ChatAgent from './components/ChatAgent.jsx'

// Tiny hash router so the two experiences each have a shareable link:
//   #/        → Guided Drafter (the original fixed-question flow)
//   #/chat    → AI Chatbot (free-form conversation)
function routeFromHash() {
  return window.location.hash.replace(/^#\/?/, '') === 'chat' ? 'chat' : 'home'
}

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

  return (
    <div className="app">
      <Navbar route={route} />

      {!keyConfigured && (
        <div className="banner">
          ⚠️ No Gemini API key detected. Add <code>GEMINI_API_KEY</code> to your <code>.env</code> file and
          restart the server.
        </div>
      )}

      {/* Remount on route change so each page starts its own fresh conversation. */}
      {route === 'chat' ? <ChatAgent key="chat" /> : <GuidedDrafter key="home" />}
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
      </div>
    </nav>
  )
}
