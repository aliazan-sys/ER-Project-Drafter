import { useEffect, useRef, useState } from 'react'
import { submitDraftSignup, loginUrlForToken, toDateInputValue, formatDisplayDate } from '../lib/api.js'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon, SparkleIcon } from './Icons.jsx'
import { TIMEZONES } from '../../shared/timezones.js'

const STEPS = [
  { id: 'title', label: 'Title' },
  { id: 'skills', label: 'Skills' },
  { id: 'scope', label: 'Scope' },
  { id: 'investment', label: 'Investment' },
  { id: 'description', label: 'Description' },
  { id: 'goals', label: 'Project Goals' },
  { id: 'review', label: 'Review' },
]

const COMPLEXITY = [
  { value: 'Large', desc: 'Long-term, complex projects (e.g. develop a nationwide campaign)' },
  { value: 'Medium', desc: 'Well-defined projects (e.g. redesign a company website)' },
  { value: 'Small', desc: 'Quick tasks, low complexity (e.g. design a logo)' },
]

const PRIVACY_URL =
  'https://equalreach.notion.site/EqualReach-Privacy-Policy-2025-25da08da675980cbb7bffca7683ba7e0'
// NOTE: same URL as the privacy policy — supplied that way. Point this at the
// real terms page once it exists.
const TERMS_URL = PRIVACY_URL

const PRICING = ['Per Unit', 'Monthly Rate', 'Fixed Price', 'Not Sure']
const CURRENCIES = ['GBP', 'EUR', 'USD']
const EXPERIENCE = [
  { value: 'Entry', desc: 'Ideal for someone starting their journey in this field' },
  { value: 'Intermediate', desc: 'Requires strong experience and proven proficiency' },
  { value: 'Expert', desc: 'Deep expertise and a track record of complex work' },
]

// Renders the AI-generated draft as an editable, multi-step wizard that
// mirrors the 7-step EqualReach "Project Request" form (reference images).
export default function ProjectDraftModal({
  draft,
  onClose,
  onSave,
  onRefine,
  // The modal unmounts on close, so a caller that wants the step remembered
  // holds it and seeds us back. Uncontrolled callers just start at Title.
  initialStep = 0,
  onStepChange,
}) {
  const [form, setForm] = useState(() => normalize(draft))
  const [step, setStepState] = useState(initialStep)
  const [signupOpen, setSignupOpen] = useState(false)
  // Only surfaced once they try to move on, so the form doesn't scold on open.
  const [showDateError, setShowDateError] = useState(false)

  const setStep = (s) => {
    setStepState(s)
    onStepChange?.(s)
  }

  const SCOPE_STEP = STEPS.findIndex((s) => s.id === 'scope')
  // A timeline needs one end or the other; which one is up to them.
  const hasDate = Boolean(form.scope.startDate || form.scope.completionDate)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  function close() {
    onSave?.(form)
    onClose()
  }

  // Keep the edits made in the wizard, then hand the user back to the chat so
  // they can describe the change instead of hunting for the right field.
  function refine() {
    onSave?.(form)
    onRefine()
  }

  // Advancing past Scope requires a date. Everything else is free to skip.
  function goNext() {
    if (current.id === 'scope' && !hasDate) {
      setShowDateError(true)
      return
    }
    setStep(step + 1)
  }

  function handleSignup() {
    // The stepper lets them jump straight to Review, so re-check here rather
    // than trusting that they walked through Scope.
    if (!hasDate) {
      setStep(SCOPE_STEP)
      setShowDateError(true)
      return
    }
    // Persist edits, then open the email-capture modal. The actual submit to
    // the EqualReach web app happens from there once we have an email.
    onSave?.(form)
    setSignupOpen(true)
  }

  // Generic setters --------------------------------------------------------
  const set = (path, value) =>
    setForm((f) => {
      const next = structuredClone(f)
      let node = next
      const keys = path.split('.')
      for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]]
      node[keys[keys.length - 1]] = value
      return next
    })

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    // Deliberately no onClick on the overlay: a stray click outside must not
    // discard the draft. Closing goes through the X or Cancel only.
    <div className="modal-overlay">
      <div className="wiz">
        {/* Sidebar stepper */}
        <aside className="wiz-side">
          <div className="wiz-side-title">PROJECT REQUEST</div>
          <ol className="stepper">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
                onClick={() => setStep(i)}
              >
                <span className="step-dot">{i < step && <CheckIcon />}</span>
                <span className="step-label">{s.label}</span>
              </li>
            ))}
          </ol>
        </aside>

        {/* Main panel */}
        <div className="wiz-main">
          <div className="wiz-head">
            <div className="wiz-step-count">Step {step + 1} of {STEPS.length}</div>
            <div className="wiz-head-actions">
              {onRefine && (
                <button className="btn ghost small refine-btn" onClick={refine}>
                  <SparkleIcon size={14} />
                  Refine with AI
                </button>
              )}
              <button className="icon-btn" onClick={close} aria-label="Close"><CloseIcon /></button>
            </div>
          </div>

          <div className="wiz-body">
            {current.id === 'title' && (
              <Section title="Write a title for your project" sub="This helps you and your team identify the project later. Keep it short and clear.">
                <Label required>Project Title</Label>
                <input
                  className="inp"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Website Re-Design for Growing Brand"
                />
              </Section>
            )}

            {current.id === 'skills' && (
              <Section title="What skills and expertise does your project need?" sub="Select the categories and tools your project requires.">
                <Label required>Choose up to 3 categories that best describe your project</Label>
                <TagEditor
                  items={form.categories}
                  max={3}
                  placeholder="Add a category…"
                  onChange={(v) => set('categories', v)}
                />
                <Label>Specific tools/platforms or skills you're looking for</Label>
                <TagEditor
                  items={form.skills}
                  placeholder="Start typing to add a skill…"
                  onChange={(v) => set('skills', v)}
                />
              </Section>
            )}

            {current.id === 'scope' && (
              <Section title="Estimate your project scope and timeline" sub="Help us understand how big this project is and when you'd like to start.">
                <Label required>How complex is this project?</Label>
                <RadioCards
                  options={COMPLEXITY}
                  value={form.scope.complexity}
                  onChange={(v) => set('scope.complexity', v)}
                />
                {/* Label and its note are one block, so the flex gap doesn't
                    split them apart from each other. */}
                <div>
                  <Label required>When do you expect this to happen?</Label>
                  <p className="field-note">Fill in at least one — whichever you're surer about.</p>
                </div>
                <div className="two-col">
                  <div>
                    <Label>Expected start date</Label>
                    <DateInput
                      value={form.scope.startDate}
                      invalid={showDateError && !hasDate}
                      onChange={(v) => {
                        set('scope.startDate', v)
                        setShowDateError(false)
                      }}
                    />
                  </div>
                  <div>
                    <Label>Target completion date</Label>
                    <DateInput
                      value={form.scope.completionDate}
                      invalid={showDateError && !hasDate}
                      onChange={(v) => {
                        set('scope.completionDate', v)
                        setShowDateError(false)
                      }}
                    />
                  </div>
                </div>
                {showDateError && !hasDate && (
                  <p className="field-error">
                    ⚠️ Please add either a start date or a completion date to continue.
                  </p>
                )}
              </Section>
            )}

            {current.id === 'investment' && (
              <Section title="Tell us about your investment" sub="This helps us match you to teams within your range.">
                <Label required>How do you want to price this project?</Label>
                <RadioCards
                  options={PRICING.map((p) => ({ value: p }))}
                  value={form.budget.pricingType}
                  onChange={(v) => set('budget.pricingType', v)}
                  columns={2}
                />
                <div>
                  <Label>Currency</Label>
                  <select className="inp" value={form.budget.currency} onChange={(e) => set('budget.currency', e.target.value)}>
                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                {form.budget.costEstimated && (
                  <p className="field-note">
                    This is an estimate based on typical market rates for a project like this. Feel free to adjust.
                  </p>
                )}
                <div className="two-col">
                  <div>
                    <Label>Estimated cost (from)</Label>
                    <input className="inp" value={form.budget.estimatedCostFrom} onChange={(e) => set('budget.estimatedCostFrom', e.target.value)} placeholder="e.g. £4,500" />
                  </div>
                  <div>
                    <Label>Estimated cost (to)</Label>
                    <input className="inp" value={form.budget.estimatedCostTo} onChange={(e) => set('budget.estimatedCostTo', e.target.value)} placeholder="e.g. £5,500" />
                  </div>
                </div>
                <Label>Additional comments on pricing</Label>
                <textarea className="inp area" value={form.budget.comments} onChange={(e) => set('budget.comments', e.target.value)} rows={3} placeholder="Anything teams should know about budget or scope…" />
              </Section>
            )}

            {current.id === 'description' && (
              <Section title="Describe your project" sub="The more detail you give, the better your proposals will be.">
                <Label required>Project description</Label>
                <textarea className="inp area tall" value={form.description} onChange={(e) => set('description', e.target.value)} rows={9} />
                <Label>Existing assets, access, or documentation to share</Label>
                <textarea className="inp area" value={form.existingAssets} onChange={(e) => set('existingAssets', e.target.value)} rows={3} placeholder="None specified" />
              </Section>
            )}

            {current.id === 'goals' && (
              <Section title="Describe your Project Goals" sub="Help us understand the impact you want to create.">
                <Label required>What does a successful outcome look like for this project?</Label>
                <textarea className="inp area" value={form.projectGoals.impactGoal} onChange={(e) => set('projectGoals.impactGoal', e.target.value)} rows={4} />
                <Label required>How will completing this project help your organization in the long run?</Label>
                <textarea className="inp area" value={form.projectGoals.impactDescription} onChange={(e) => set('projectGoals.impactDescription', e.target.value)} rows={4} />
              </Section>
            )}

            {current.id === 'review' && (
              <ReviewStep form={form} set={set} goTo={setStep} />
            )}
          </div>

          {/* Footer nav */}
          <div className="wiz-foot">
            {step > 0 ? (
              <button className="btn ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeftIcon /> Back
              </button>
            ) : <span />}
            {isLast ? (
              <div className="foot-right">
                <button className="btn plain" onClick={close}>Cancel</button>
                <button className="btn primary" onClick={handleSignup}>
                  Sign up to submit the project <ArrowRightIcon />
                </button>
              </div>
            ) : (
              <button className="btn primary" onClick={goNext}>
                Save and Continue <ArrowRightIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {signupOpen && (
        <SignupModal draft={form} onClose={() => setSignupOpen(false)} />
      )}
    </div>
  )
}

// --- Email capture + submit to the EqualReach web app ---------------------
function SignupModal({ draft, onClose }) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [error, setError] = useState('')

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const valid =
    emailValid &&
    firstName.trim() !== '' &&
    lastName.trim() !== ''

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && status !== 'submitting' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, onClose])

  async function submit(e) {
    e?.preventDefault()
    if (!valid || status === 'submitting') return
    setStatus('submitting')
    setError('')
    try {
      const { aiDrafterToken } = await submitDraftSignup(email.trim(), draft, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      setStatus('done')
      const url = loginUrlForToken(aiDrafterToken)
      if (window.self !== window.top) {
        // Running inside an iframe (the AI Drafter is embedded in the Bubble
        // app). Navigate the WHOLE tab, not just the frame. For a normal
        // (non-sandboxed) iframe, setting the top-level location works even
        // cross-origin, so this is the primary path. The postMessage after it
        // is a fallback the host page can act on if top navigation is blocked
        // (e.g. the iframe is sandboxed).
        try {
          window.top.location.href = url
        } catch {
          /* top navigation blocked — host listener fallback below */
        }
        window.parent.postMessage({ type: 'er-navigate', url }, '*')
      } else {
        window.location.href = url
      }
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="modal-overlay" onClick={() => status !== 'submitting' && onClose()}>
      <div className="signup-card" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn signup-close" onClick={onClose} aria-label="Close" disabled={status === 'submitting'}>✕</button>

        {status === 'done' ? (
          <div className="signup-done">
            <div className="signup-check">✓</div>
            <h2 className="signup-title">You're all set!</h2>
            <p className="signup-sub">
              We've saved your project draft. Taking you to EqualReach to finish setting up your
              account for <strong>{email.trim()}</strong>…
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 className="signup-title">Submit your project</h2>
            <p className="signup-sub">
              Enter your email and we'll create your EqualReach account with this project draft
              ready to go.
            </p>

            <div className="two-col">
              <div>
                <label className="flabel" htmlFor="signup-first">First name <span className="req">*</span></label>
                <input
                  id="signup-first"
                  className="inp"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  autoFocus
                  disabled={status === 'submitting'}
                />
              </div>
              <div>
                <label className="flabel" htmlFor="signup-last">Last name <span className="req">*</span></label>
                <input
                  id="signup-last"
                  className="inp"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  disabled={status === 'submitting'}
                />
              </div>
            </div>

            <label className="flabel" htmlFor="signup-email" style={{ marginTop: 18 }}>Email address <span className="req">*</span></label>
            <input
              id="signup-email"
              className="inp"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              disabled={status === 'submitting'}
            />

            {status === 'error' && <p className="signup-error">⚠️ {error}</p>}

            <button
              type="submit"
              className="btn primary signup-submit"
              disabled={!valid || status === 'submitting'}
            >
              {status === 'submitting' ? 'Submitting…' : 'Sign up to submit'}
            </button>
            <p className="signup-fine">
              By continuing you agree to EqualReach's{' '}
              <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">terms and conditions</a>
              {' '}and{' '}
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">privacy policy</a>.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

// --- Review (Step 7) summary, with editable extras ------------------------
function ReviewStep({ form, set, goTo }) {
  const org = form.orgProfile
  const adv = form.advancedTerms
  return (
    <Section title="Review & finishing touches" sub="Review your project details and edit anything before submitting.">
      <div className="chip-row">
        <EditChip label="Type" value={org.type} onChange={(v) => set('orgProfile.type', v)} />
        <EditChip label="Size" value={org.size} onChange={(v) => set('orgProfile.size', v)} />
        <EditChip label="Industry" value={org.industry} onChange={(v) => set('orgProfile.industry', v)} />
        <EditChip label="Location" value={org.location} onChange={(v) => set('orgProfile.location', v)} />
      </div>

      <SummaryCard title="Project Title" onEdit={() => goTo(0)}>
        <p className="strong">{form.title || '—'}</p>
      </SummaryCard>

      <SummaryCard title="Skills & Category" onEdit={() => goTo(1)}>
        <TagList items={form.categories} empty="No categories" />
        <div style={{ height: 8 }} />
        <TagList items={form.skills} empty="No skills" />
      </SummaryCard>

      <SummaryCard title="Scope" onEdit={() => goTo(2)}>
        <div className="grid-2">
          <Field icon="▦" label="Project Size" value={form.scope.complexity} />
          <Field icon="▤" label="Timeline" value={timeline(form.scope)} />
        </div>
      </SummaryCard>

      <SummaryCard title="Investment" onEdit={() => goTo(3)}>
        <div className="grid-3">
          <Field icon="$" label="Currency" value={form.budget.currency} />
          <Field icon="▭" label="Payment Type" value={form.budget.pricingType} />
          <Field icon="▥" label="Estimated Cost" value={costRange(form.budget)} />
        </div>
        {/* Optional field — an empty one is noise on the summary. */}
        {form.budget.comments?.trim() && (
          <div className="subfield">
            <span className="sub-label">Additional Comments on Pricing</span>
            <p>{form.budget.comments}</p>
          </div>
        )}
      </SummaryCard>

      <SummaryCard title="Description" onEdit={() => goTo(4)}>
        <Paragraphs text={form.description} />
        <div className="subfield">
          <span className="sub-label">Additional Assets Client Will Provide</span>
          <p>{form.existingAssets || 'None specified'}</p>
        </div>
      </SummaryCard>

      <SummaryCard title="Project Goals" onEdit={() => goTo(5)}>
        <div className="subfield"><span className="sub-label">Impact Goal</span><p>{form.projectGoals.impactGoal || '—'}</p></div>
        <div className="subfield"><span className="sub-label">Impact Description</span><p>{form.projectGoals.impactDescription || '—'}</p></div>
      </SummaryCard>

      <h3 className="section-title">Additional Information</h3>

      <div className="card">
        <div className="card-head"><h4>Screening Questions</h4></div>
        <p className="card-note">
          Screening Questions help you assess whether a team is the right fit for your project
          before selecting a proposal.
        </p>
        <ListEditor items={form.screeningQuestions} placeholder="Write your own question…" onChange={(v) => set('screeningQuestions', v)} />
      </div>

      <div className="card">
        <div className="card-head">
          <h4>Level of Experience</h4>
          {form.levelOfExperience && (
            <button className="link-btn" onClick={() => set('levelOfExperience', '')}>
              Clear
            </button>
          )}
        </div>
        <p className="card-note">Optional — leave blank if you're open to any level.</p>
        <RadioCards
          options={EXPERIENCE}
          value={form.levelOfExperience}
          onChange={(v) => set('levelOfExperience', v)}
          clearable
        />
      </div>

      <div className="card">
        <div className="card-head"><h4>Advanced Terms</h4></div>
        <div className="two-col">
          <div>
            <Label>Language</Label>
            <TagEditor items={adv.languages} placeholder="Add a language…" onChange={(v) => set('advancedTerms.languages', v)} />
          </div>
          <div>
            <Label>Preferred Timezone</Label>
            <MultiSelect
              items={adv.timezone}
              options={TIMEZONES}
              placeholder="Add a timezone…"
              onChange={(v) => set('advancedTerms.timezone', v)}
            />
          </div>
        </div>
      </div>
    </Section>
  )
}

// --- Small building blocks ------------------------------------------------
function Section({ title, sub, children }) {
  return (
    <div className="wiz-section">
      <h2 className="wiz-title">{title}</h2>
      {sub && <p className="wiz-sub">{sub}</p>}
      <div className="wiz-fields">{children}</div>
    </div>
  )
}

function Label({ children, required, style }) {
  return (
    <label className="flabel" style={style}>
      {children} {required && <span className="req">*</span>}
    </label>
  )
}

// A real date picker that still reads in the house format. The native input
// renders per browser locale ("08/12/2026") and can't be restyled, so it sits
// transparent on top for the picker + keyboard, with our own text underneath.
function DateInput({ value, onChange, invalid }) {
  const ref = useRef(null)
  const iso = toDateInputValue(value)
  return (
    <div className={`date-input ${invalid ? 'invalid' : ''}`}>
      <input
        ref={ref}
        type="date"
        className="date-input-native"
        value={iso}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => ref.current?.showPicker?.()}
        aria-label="Date"
      />
      <span className={`date-input-text ${iso ? '' : 'is-placeholder'}`}>
        {iso ? formatDisplayDate(iso) : 'Select a date'}
      </span>
      <span className="date-input-icon" aria-hidden="true">▦</span>
    </div>
  )
}

// `clearable` marks an optional group: clicking the chosen card again unsets it.
// Off by default so the required groups can't be emptied by a stray click.
function RadioCards({ options, value, onChange, columns = 1, clearable = false }) {
  return (
    <div className={`radio-cards ${columns === 2 ? 'cols-2' : ''}`}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={`radio-card ${value === o.value ? 'selected' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(clearable && value === o.value ? '' : o.value)}
        >
          <span className="radio-mark" />
          <span>
            <span className="radio-title">{o.value}</span>
            {o.desc && <span className="radio-desc">{o.desc}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

function TagEditor({ items = [], onChange, placeholder, max }) {
  const [text, setText] = useState('')
  const atMax = max && items.length >= max
  function add() {
    const v = text.trim()
    if (!v || atMax || items.includes(v)) return
    onChange([...items, v])
    setText('')
  }
  return (
    <div className="tag-editor">
      <input
        className="inp"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={atMax ? `Up to ${max} — remove one to add another` : placeholder}
        disabled={atMax}
      />
      {items.length > 0 && (
        <div className="tags">
          {items.map((t, i) => (
            <span key={i} className="tag editable">
              <button
                type="button"
                className="tag-x"
                aria-label={`Remove ${t}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Like TagEditor, but picks come from a fixed list instead of free text — the
// selected values render as removable chips and the dropdown resets each time.
function MultiSelect({ items = [], options, onChange, placeholder }) {
  const remaining = options.filter((o) => !items.includes(o))
  return (
    <div className="tag-editor">
      <select
        className="inp"
        value=""
        disabled={remaining.length === 0}
        onChange={(e) => e.target.value && onChange([...items, e.target.value])}
      >
        <option value="">{placeholder}</option>
        {remaining.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {items.length > 0 && (
        <div className="tags">
          {items.map((t) => (
            <span key={t} className="tag editable">
              <button
                type="button"
                className="tag-x"
                aria-label={`Remove ${t}`}
                onClick={() => onChange(items.filter((v) => v !== t))}
              >
                ×
              </button>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ListEditor({ items = [], onChange, placeholder }) {
  const [text, setText] = useState('')
  function add() {
    const v = text.trim()
    if (!v) return
    onChange([...items, v])
    setText('')
  }
  return (
    <div>
      <ul className="list-edit">
        {items.map((q, i) => (
          <li key={i}>
            <span>{q}</span>
            <button type="button" className="tag-x" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ul>
      <div className="list-add">
        <input className="inp" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder={placeholder} />
        <button type="button" className="btn ghost small" onClick={add}>+ Add</button>
      </div>
    </div>
  )
}

function EditChip({ label, value, onChange }) {
  return (
    <div className="chip">
      <span className="chip-label">{label}</span>
      <input className="chip-input" value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function SummaryCard({ title, onEdit, children }) {
  return (
    <section className="card">
      <div className="card-head">
        <h4>{title}</h4>
        <button className="edit-pencil" onClick={onEdit} title="Edit this section">✎</button>
      </div>
      {children}
    </section>
  )
}

function Field({ icon, label, value }) {
  return (
    <div className="field-box">
      {icon && <span className="field-icon">{icon}</span>}
      <div>
        <div className="field-label">{label}</div>
        <div className="field-value">{value || '—'}</div>
      </div>
    </div>
  )
}

function TagList({ items, empty }) {
  if (!Array.isArray(items) || items.length === 0) return <p className="muted">{empty}</p>
  return <div className="tags">{items.map((t, i) => <span key={i} className="tag">{t}</span>)}</div>
}

function Paragraphs({ text }) {
  if (!text) return <p className="muted">—</p>
  return String(text).split(/\n{2,}|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)
}

function costRange(budget) {
  const from = budget.estimatedCostFrom
  const to = budget.estimatedCostTo
  if (from && to) return `${from} – ${to}`
  return from || to || 'N/A'
}

function timeline(scope) {
  const from = formatDisplayDate(scope.startDate)
  const to = formatDisplayDate(scope.completionDate)
  if (from && to) return `${from} → ${to}`
  return from || to || 'N/A'
}

// Fill in any missing fields so the editor never hits undefined.
function normalize(d = {}) {
  return {
    title: d.title || '',
    categories: d.categories || [],
    skills: d.skills || [],
    scope: {
      complexity: '',
      ...(d.scope || {}),
      // The model writes prose dates ("Mid-August 2026"); the picker needs
      // yyyy-mm-dd. Canonicalize once here so everything downstream agrees.
      startDate: toDateInputValue(d.scope?.startDate),
      completionDate: toDateInputValue(d.scope?.completionDate),
    },
    budget: {
      pricingType: '',
      estimatedCostFrom: '',
      estimatedCostTo: '',
      costEstimated: false,
      comments: '',
      ...(d.budget || {}),
      // Only GBP/EUR/USD are supported (matches the Bubble currency Option Set).
      currency: CURRENCIES.includes(d.budget?.currency) ? d.budget.currency : 'GBP',
    },
    description: d.description || '',
    existingAssets: d.existingAssets || '',
    projectGoals: { impactGoal: '', impactDescription: '', ...(d.projectGoals || {}) },
    orgProfile: { type: '', size: '', industry: '', location: '', ...(d.orgProfile || {}) },
    screeningQuestions: d.screeningQuestions || [],
    levelOfExperience: d.levelOfExperience || '',
    advancedTerms: {
      languages: [],
      ...(d.advancedTerms || {}),
      // Bubble types this as a list. Accept a bare string too (older drafts,
      // or a model that ignored the schema) and drop anything off-list, so we
      // never submit a value the Option Set can't represent.
      timezone: [d.advancedTerms?.timezone].flat().filter((tz) => TIMEZONES.includes(tz)),
    },
  }
}
