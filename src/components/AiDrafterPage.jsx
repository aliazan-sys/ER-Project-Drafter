import { useEffect, useState } from 'react'
import { getMarketplaceSuggestions } from '../lib/api.js'

export default function AiDrafterPage() {
  const queryValue = new URLSearchParams(window.location.search).get('q')?.trim()
  const searchTerm = queryValue ? queryValue.slice(0, 120) : 'illustration'
  const [prompt, setPrompt] = useState('')
  const [suggestedPrompts, setSuggestedPrompts] = useState([])

  useEffect(() => {
    let active = true
    getMarketplaceSuggestions(searchTerm)
      .then((suggestions) => {
        if (active) setSuggestedPrompts(suggestions.slice(0, 4))
      })
      .catch(() => {
        if (active) {
          setSuggestedPrompts([
            `${searchTerm} project brief`,
            `${searchTerm} concept development`,
            `${searchTerm} project scope`,
            `custom ${searchTerm} project`,
          ])
        }
      })
    return () => {
      active = false
    }
  }, [searchTerm])

  const goBack = () => {
    if (window.top === window) {
      window.history.back()
      return
    }
    window.parent.postMessage({ type: 'er-marketplace-drafter-back' }, '*')
  }

  const startWebsiteDrafter = () => {
    const initialPrompt = prompt.trim()
    if (!initialPrompt) return

    const destination = new URL('https://www.equalreach.io/project-drafter-equalreach')
    destination.searchParams.set('initial_prompt', initialPrompt)

    // Same-origin fallback for hosts that have not installed the query-forwarding
    // snippet yet. The query parameter remains the canonical handoff.
    localStorage.setItem('er_initial_prompt', initialPrompt)

    if (window.top === window) {
      window.location.assign(destination.toString())
      return
    }

    window.parent.postMessage(
      { type: 'er-marketplace-drafter-start', url: destination.toString() },
      '*',
    )
    window.open(destination.toString(), '_top')
  }

  return (
    <main className="simple-ai-drafter">
      <section className="marketplace-drafter-card" aria-labelledby="marketplace-drafter-title">
        <header className="marketplace-drafter-head">
          <div className="marketplace-drafter-brand">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 2.5c.4 3.9 2.1 5.6 6 6-3.9.4-5.6 2.1-6 6-.4-3.9-2.1-5.6-6-6 3.9-.4 5.6-2.1 6-6Z" />
              <path d="M18.3 1.5c.2 2 1.1 2.9 3.2 3.2-2.1.2-3 1.1-3.2 3.2-.2-2.1-1.1-3-3.2-3.2 2.1-.3 3-1.2 3.2-3.2Z" />
              <path d="M17.8 13.1c.2 2.6 1.4 3.8 4.2 4.1-2.8.3-4 1.5-4.2 4.3-.3-2.8-1.5-4-4.3-4.3 2.8-.3 4-1.5 4.3-4.1Z" />
            </svg>
            <h1 id="marketplace-drafter-title">AI Project Drafter</h1>
          </div>
          <span className="marketplace-drafter-status">Nothing submitted yet</span>
        </header>

        <div className="marketplace-drafter-body">
          <div className="marketplace-search-context">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="5.7" />
              <path d="m15.1 15.1 4 4" />
            </svg>
            <span>Starting from your search:</span>
            <q>{searchTerm}</q>
          </div>

          <div className="marketplace-question">
            Let&apos;s turn &quot;{searchTerm}&quot; into a project brief. To start — what are you hoping to
            use these for?
          </div>

          <div className="marketplace-choices" aria-label="Suggested answers">
            {suggestedPrompts.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <div className="simple-ai-drafter-form" aria-label="AI Drafter prompt">
            <input
              type="text"
              aria-label="Prompt"
              placeholder="Type your answer..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  startWebsiteDrafter()
                }
              }}
            />
            <button
              type="button"
              aria-label="Start project draft"
              disabled={!prompt.trim()}
              onClick={startWebsiteDrafter}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m4 5 16 7-16 7 3-7-3-7Z" />
                <path d="M7 12h13" />
              </svg>
            </button>
          </div>

          <p className="marketplace-drafter-note">
            You&apos;ll review and edit the full brief before anything is submitted.{' '}
            <button type="button" onClick={goBack}>Back</button>
          </p>
        </div>
      </section>
    </main>
  )
}
