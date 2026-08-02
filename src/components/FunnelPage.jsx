import { useCallback, useEffect, useState } from 'react'
import { getFunnelSummary } from '../lib/api.js'

// The drafter funnel: how many conversations start, how far each one gets, and
// how many finish. Reads the `funnel_summary` view in Supabase through
// /api/funnel — see shared/funnel.js for what each stage means.

// Stage order is the funnel order. Colours are an ORDINAL ramp — one hue,
// monotone light→dark — because the stages have a fixed sequence and the
// reader should see that order in the colour. Validated against the white card
// surface: monotone lightness, visible step gaps, light end 2.07:1 (>= 2:1).
const STAGES = [
  {
    key: 'conversation',
    label: 'Started a conversation',
    note: 'Sent a first message to the drafter',
    color: '#5cc3ce',
  },
  {
    key: 'review',
    label: 'Reached the draft review',
    note: 'The AI produced a draft and the wizard opened',
    color: '#2ba9b7',
  },
  {
    key: 'signup',
    label: 'Reached signup',
    note: 'Opened the signup form',
    color: '#15818d',
  },
  {
    key: 'completed',
    label: 'Completed',
    note: 'Pressed "Sign up to submit the project"',
    color: '#0b5d66',
  },
]

export default function FunnelPage() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setStatus('loading')
    try {
      setData(await getFunnelSummary())
      setStatus('ready')
    } catch (err) {
      setError(err.message || 'Could not load the funnel.')
      setStatus('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Each stage's bar is CUMULATIVE — everyone who got at least this far —
  // because that is what a funnel asks. The stored `stage` is where a
  // conversation STOPPED, so reaching a stage means stopping at it or later.
  const rows = data
    ? STAGES.map((s, i) => {
        const reached = [
          data.conversationsStarted,
          data.leftInReview + data.leftInSignup + data.completed,
          data.leftInSignup + data.completed,
          data.completed,
        ][i]
        const droppedHere = [
          data.leftInConversation,
          data.leftInReview,
          data.leftInSignup,
          0,
        ][i]
        const share = data.conversationsStarted
          ? Math.round((reached / data.conversationsStarted) * 100)
          : 0
        return { ...s, reached, droppedHere, share }
      })
    : []

  const completionRate =
    data && data.conversationsStarted
      ? Math.round((data.completed / data.conversationsStarted) * 100)
      : 0

  return (
    <>
      <header className="topbar">
        <div className="page-head">
          <div className="page-title">Funnel</div>
          <div className="page-sub">How far people get in the AI drafter · live traffic only</div>
        </div>
        <button className="reopen" onClick={() => load(true)} disabled={status === 'loading'}>
          {status === 'loading' ? 'Loading…' : '↻ Refresh'}
        </button>
      </header>

      <main className="chat">
        <div className="funnel-page">
          {status === 'loading' && !data && <p className="muted">Loading funnel…</p>}

          {status === 'error' && (
            <div className="history-empty">
              <p className="strong">⚠️ {error}</p>
              <p className="muted">
                Tracking is stored in Supabase. If <code>DATABASE_URL</code> isn't set, no numbers
                are recorded and this page has nothing to show.
              </p>
            </div>
          )}

          {data && data.conversationsStarted === 0 && (
            <div className="history-empty">
              <p className="strong">No conversations tracked yet.</p>
              <p className="muted">
                Only traffic on the live site is counted — conversations on localhost and preview
                deploys are deliberately not recorded, so this stays empty until a real visitor
                starts a draft.
              </p>
            </div>
          )}

          {data && data.conversationsStarted > 0 && (
            <>
              {/* Headline numbers. A KPI row, not a chart — four single values
                  have no shape worth plotting. */}
              <div className="kpi-row">
                <Stat label="Conversations started" value={data.conversationsStarted} />
                <Stat label="Completed" value={data.completed} />
                <Stat label="Completion rate" value={`${completionRate}%`} />
                <Stat label="Unique visitors" value={data.uniqueVisitors} />
              </div>

              <section className="card">
                <div className="card-head"><h4>How far each conversation got</h4></div>
                <p className="card-note">
                  Cumulative — each bar counts everyone who reached that stage or went past it.
                </p>

                <ul className="funnel-bars">
                  {rows.map((r) => (
                    <li key={r.key} className="funnel-row">
                      <div className="funnel-row-head">
                        <span className="funnel-label">{r.label}</span>
                        <span className="funnel-value">
                          {r.reached}
                          <span className="funnel-share">{r.share}%</span>
                        </span>
                      </div>
                      <div className="funnel-track">
                        <div
                          className="funnel-fill"
                          style={{ width: `${r.share}%`, background: r.color }}
                        />
                        {/* Hover detail, using the same tooltip idiom as the
                            drafter's info badges. */}
                        <span className="funnel-tip" role="tooltip">
                          {r.note}. {r.reached} of {data.conversationsStarted} conversations
                          {r.droppedHere > 0 && ` · ${r.droppedHere} stopped here`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* The table view: the same data read the other way — exclusive
                  counts, i.e. where each conversation actually stopped. Also
                  the accessible fallback for the bars above. */}
              <section className="card">
                <div className="card-head"><h4>Where people left off</h4></div>
                <p className="card-note">Each conversation counted once, at the furthest point it reached.</p>
                <table className="funnel-table">
                  <thead>
                    <tr>
                      <th scope="col">Left off at</th>
                      <th scope="col">Conversations</th>
                      <th scope="col">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['During the conversation', data.leftInConversation],
                      ['During review', data.leftInReview],
                      ['During signup', data.leftInSignup],
                      ['Completed', data.completed],
                    ].map(([label, count]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>{count}</td>
                        <td className="muted">
                          {Math.round((count / data.conversationsStarted) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  )
}

function Stat({ label, value }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
    </div>
  )
}
