import { useEffect, useState } from 'react'
import { listProjectFunnels } from '../lib/api.js'

const STAGES = [
  ['conversation', 'Started conversation'],
  ['review', 'Reached draft review'],
  ['signup', 'Reached signup'],
  ['completed', 'Completed'],
]

export default function ProjectFunnelsPage() {
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  async function load() {
    setStatus('loading')
    setError('')
    try {
      setProjects(await listProjectFunnels())
      setStatus('ready')
    } catch (err) {
      setError(err.message || 'Could not load project funnel data.')
      setStatus('error')
    }
  }

  useEffect(() => { load() }, [])

  return <>
    <header className="topbar">
      <div className="page-head">
        <div className="page-title">Project Funnels</div>
        <div className="page-sub">Funnel progress linked to each saved project draft</div>
      </div>
      <button className="reopen" onClick={load} disabled={status === 'loading'}>
        {status === 'loading' ? 'Loading…' : '↻ Refresh'}
      </button>
    </header>
    <main className="chat">
      <div className="project-funnels-list">
        {status === 'loading' && <p className="muted">Loading project funnels…</p>}
        {status === 'error' && <p className="muted" role="alert">⚠️ {error}</p>}
        {status === 'ready' && projects.length === 0 && (
          <div className="history-empty">
            <p className="strong">No saved project drafts yet.</p>
            <p className="muted">Saved drafts appear here with their linked funnel progress.</p>
          </div>
        )}
        {projects.map((project) => {
          const stageIndex = STAGES.findIndex(([key]) => key === project.funnel_stage)
          return <article className="project-funnel-card" key={project.id}>
            <div className="project-funnel-heading">
              <div>
                <h2>{project.title || 'Untitled project'}</h2>
                <p>{formatDate(project.created_at)}</p>
              </div>
              <span className={`mode-badge ${project.mode === 'platform' ? 'platform' : 'website'}`}>
                {project.mode === 'platform' ? 'Platform Drafter' : 'Website Drafter'}
              </span>
            </div>
            {project.funnel_tracked ? <>
              <div className="project-funnel-steps" aria-label={`Funnel stage: ${STAGES[stageIndex]?.[1]}`}>
                {STAGES.map(([key, label], index) => <div
                  key={key}
                  className={`project-funnel-step ${index <= stageIndex ? 'reached' : ''} ${index === stageIndex ? 'current' : ''}`}
                >
                  <span className="project-funnel-dot" aria-hidden="true">{index < stageIndex ? '✓' : index + 1}</span>
                  <span>{label}</span>
                </div>)}
              </div>
              <p className="project-funnel-status">Furthest stage: <strong>{STAGES[stageIndex]?.[1] || 'Unknown'}</strong></p>
              {project.completion_email && <p className="project-funnel-status">Signup email: <strong>{project.completion_email}</strong></p>}
            </> : <p className="project-funnel-status muted">No matching live funnel session was recorded for this saved draft.</p>}
          </article>
        })}
      </div>
    </main>
  </>
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}
