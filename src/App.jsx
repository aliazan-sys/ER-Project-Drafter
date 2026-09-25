import { useEffect, useState } from 'react'
import { checkHealth, getAdminSession, logoutAdmin } from './lib/api.js'
import ChatAgent from './components/ChatAgent.jsx'
import HistoryPage from './components/HistoryPage.jsx'
import DraftPage from './components/DraftPage.jsx'
import PlatformDraftPage from './components/PlatformDraftPage.jsx'
import BubbleDraftPage from './components/BubbleDraftPage.jsx'
import FunnelPage from './components/FunnelPage.jsx'
import AiDrafterPage from './components/AiDrafterPage.jsx'
import { AdminGate, AdminLayout } from './components/AdminAccess.jsx'

// Tiny hash router so each experience has a shareable link:
//   #/ or #/draft → Website Project Drafter
//   #/platform-draft → Platform Project Drafter
//   #/ai-drafter → Simple AI Drafter prompt
//   #/history  → Saved Projects (conversations + drafts)
//   #/funnel   → Funnel (how far people get in the drafter)
function routeFromHash() {
  const r = window.location.hash.replace(/^#\/?/, '')
  if (r === 'platform-draft') return 'platform-draft'
  if (r === 'ai-drafter') return 'ai-drafter'
  if (r === 'admin') return 'admin'
  if (r === 'history') return 'history'
  if (r === 'funnel') return 'funnel'
  return 'draft'
}

// ?embed=1      → compact chat bubble widget for Webflow
// ?embed=draft  → original Project Drafter iframe for Webflow
// ?embed=bubble → separate existing-user Project Drafter for the Bubble app
// ?embed=platform → existing-user Platform Project Drafter for the Bubble app
// ?embed=marketplace → navbar-free Marketplace Drafter iframe
const params = new URLSearchParams(window.location.search)
const EMBED_CHAT = params.get('embed') === '1'
const EMBED_DRAFT = params.get('embed') === 'draft'
const EMBED_BUBBLE = params.get('embed') === 'bubble'
const EMBED_PLATFORM = params.get('embed') === 'platform'
const EMBED_MARKETPLACE = params.get('embed') === 'marketplace'

export default function App() {
  const [route, setRoute] = useState(routeFromHash)
  const [keyConfigured, setKeyConfigured] = useState(true)
  const [adminSession, setAdminSession] = useState({
    status: 'loading',
    authenticated: false,
    user: null,
    configured: true,
  })

  useEffect(() => {
    checkHealth().then((h) => setKeyConfigured(Boolean(h.keyConfigured)))
    getAdminSession()
      .then((session) => setAdminSession({ status: 'ready', ...session }))
      .catch(() =>
        setAdminSession({
          status: 'ready',
          authenticated: false,
          user: null,
          configured: true,
        }),
      )
  }, [])

  async function signOutAdmin() {
    try {
      await logoutAdmin()
    } finally {
      setAdminSession({
        status: 'ready',
        authenticated: false,
        user: null,
        configured: true,
      })
      window.location.hash = '#/draft'
    }
  }

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!EMBED_MARKETPLACE) return undefined

    const embed = document.querySelector('.marketplace-embed')
    if (!embed) return undefined

    let frame = 0
    const reportHeight = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(embed.getBoundingClientRect().height)
        window.parent?.postMessage({ type: 'er-marketplace-drafter-resize', height }, '*')
      })
    }

    const observer = new ResizeObserver(reportHeight)
    observer.observe(embed)
    window.addEventListener('load', reportHeight)
    document.fonts?.ready.then(reportHeight)
    reportHeight()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('load', reportHeight)
    }
  }, [])

  if (EMBED_CHAT) {
    return (
      <div className="app embed">
        <ChatAgent key="chat-widget" />
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
      <div className="app wide bubble-drafter">
        <BubbleDraftPage key="bubble-draft-embed" />
      </div>
    )
  }

  if (EMBED_PLATFORM) {
    const existingUserId = (params.get('u') || '').trim()
    return (
      <div className="app wide bubble-drafter">
        <PlatformDraftPage
          key="platform-draft-embed"
          submissionMode="bubble-existing-user"
          existingUserId={existingUserId}
        />
      </div>
    )
  }

  if (EMBED_MARKETPLACE) {
    return (
      <div className="app wide marketplace-embed">
        <AiDrafterPage key="marketplace-draft-embed" />
      </div>
    )
  }

  // Drafter tabs use the full-width workspace below the shared navbar.
  if (route === 'draft' || route === 'platform-draft' || route === 'ai-drafter') {
    return (
      <div className="app wide">
        <Navbar route={route} adminSession={adminSession} />
        {!keyConfigured && (
          <div className="banner">
            ⚠️ No Gemini API key detected. Add <code>GEMINI_API_KEY</code> to your <code>.env</code> file and
            restart the server.
          </div>
        )}
        {route === 'draft' && <DraftPage key="website-draft" />}
        {route === 'platform-draft' && <PlatformDraftPage key="platform-draft" />}
        {route === 'ai-drafter' && <AiDrafterPage key="ai-drafter" />}
      </div>
    )
  }

  return (
    <div className="app wide">
      <AdminGate
        session={adminSession}
        onAuthenticated={(session) =>
          setAdminSession({ status: 'ready', configured: true, ...session })
        }
      >
        <AdminLayout route={route} user={adminSession.user} onLogout={signOutAdmin}>
          {(route === 'admin' || route === 'history') && <HistoryPage key="history" />}
          {route === 'funnel' && <FunnelPage key="funnel" />}
        </AdminLayout>
      </AdminGate>
    </div>
  )
}

function Navbar({ route, adminSession }) {
  return (
    <nav className="navbar">
      <a className="brand" href="#/draft" aria-label="EqualReach home">
        <span className="brand-mark">◐</span>
        <div>
          <div className="brand-name">EqualReach</div>
          <div className="brand-sub">Project Request Drafter</div>
        </div>
      </a>
      <div className="nav-links">
        <a href="#/draft" className={`nav-link ${route === 'draft' ? 'active' : ''}`}>
          Website Project Drafter
        </a>
        <a
          href="#/platform-draft"
          className={`nav-link ${route === 'platform-draft' ? 'active' : ''}`}
        >
          Platform Project Drafter
        </a>
        <a href="#/ai-drafter" className={`nav-link ${route === 'ai-drafter' ? 'active' : ''}`}>
          Marketplace Drafter
        </a>
        <a href="#/admin" className={`nav-link ${route === 'admin' ? 'active' : ''}`}>
          {adminSession.authenticated ? 'Admin Dashboard' : 'Admin'}
        </a>
      </div>
    </nav>
  )
}
