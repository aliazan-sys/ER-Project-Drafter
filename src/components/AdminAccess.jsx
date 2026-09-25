import { useState } from 'react'
import { loginAdmin } from '../lib/api.js'

export function AdminGate({ session, onAuthenticated, children }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  if (session.status === 'loading') {
    return <main className="admin-access"><p className="muted">Checking admin access...</p></main>
  }

  if (session.authenticated) return children

  async function submit(event) {
    event.preventDefault()
    if (!email.trim() || !password) return
    setStatus('loading')
    setError('')
    try {
      const next = await loginAdmin(email.trim(), password)
      setPassword('')
      onAuthenticated(next)
    } catch (err) {
      setError(err.message || 'Could not sign in.')
      setStatus('idle')
    }
  }

  return (
    <main className="admin-access">
      <form className="admin-login-card" onSubmit={submit}>
        <div className="admin-login-mark" aria-hidden="true">◐</div>
        <h1>Admin access</h1>
        <p>Sign in to view saved projects and funnel analytics.</p>

        {!session.configured && (
          <div className="admin-login-error">Admin access is not configured on this environment.</div>
        )}
        {error && <div className="admin-login-error" role="alert">{error}</div>}

        <label className="admin-login-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
          />
        </label>
        <label className="admin-login-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        <button
          className="admin-login-submit"
          type="submit"
          disabled={status === 'loading' || !session.configured || !email.trim() || !password}
        >
          {status === 'loading' ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

export function AdminLayout({ route, user, onLogout, children }) {
  const savedProjectsActive = route === 'admin' || route === 'history'

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-sidebar-brand" href="#/admin" aria-label="Admin dashboard">
          <span className="admin-sidebar-mark" aria-hidden="true">◐</span>
          <span>
            <strong>EqualReach</strong>
            <small>Admin dashboard</small>
          </span>
        </a>

        <nav className="admin-sidebar-nav" aria-label="Admin navigation">
          <a href="#/history" className={savedProjectsActive ? 'active' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3.5h7l4 4V20.5H7z" />
              <path d="M14 3.5v4h4M10 12h5M10 15.5h5" />
            </svg>
            Saved Projects
          </a>
          <a href="#/funnel" className={route === 'funnel' ? 'active' : ''}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16M7 10h10M10 15h4M11.5 19h1" />
            </svg>
            Funnel
          </a>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-account">
            <span className="admin-account-avatar" aria-hidden="true">
              {(user?.email || 'A').charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>Administrator</strong>
              <small title={user?.email || ''}>{user?.email || 'Signed in'}</small>
            </span>
          </div>
          <button type="button" onClick={onLogout}>Sign out</button>
          <a href="#/draft">Back to Project Drafter</a>
        </div>
      </aside>

      <section className="admin-main">{children}</section>
    </div>
  )
}
