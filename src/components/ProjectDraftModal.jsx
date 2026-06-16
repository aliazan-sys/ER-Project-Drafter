import { useEffect, useState } from 'react'

const SIGNUP_URL = 'https://app.equalreach.io/signup'

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

const PRICING = ['Per Unit', 'Monthly Rate', 'Fixed Price', 'Not Sure']
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'INR']
const EXPERIENCE = [
  { value: 'Entry', desc: 'Ideal for someone starting their journey in this field' },
  { value: 'Intermediate', desc: 'Requires strong experience and proven proficiency' },
  { value: 'Expert', desc: 'Deep expertise and a track record of complex work' },
]

// Renders the AI-generated draft as an editable, multi-step wizard that
// mirrors the 7-step EqualReach "Project Request" form (reference images).
export default function ProjectDraftModal({ draft, onClose, onSave }) {
  const [form, setForm] = useState(() => normalize(draft))
  const [step, setStep] = useState(0)

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

  function handleSignup() {
    // Persist edits, then hand off to the EqualReach web app signup.
    onSave?.(form)
    window.open(SIGNUP_URL, '_blank', 'noopener,noreferrer')
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
    <div className="modal-overlay" onClick={close}>
      <div className="wiz" onClick={(e) => e.stopPropagation()}>
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
                <span className="step-dot" />
                <span className="step-label">{s.label}</span>
              </li>
            ))}
          </ol>
        </aside>

        {/* Main panel */}
        <div className="wiz-main">
          <div className="wiz-head">
            <div className="wiz-step-count">Step {step + 1} of {STEPS.length}</div>
            <button className="icon-btn" onClick={close} aria-label="Close">✕</button>
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
                <Label style={{ marginTop: 20 }}>Specific tools or skills you're looking for</Label>
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
                <div className="two-col">
                  <div>
                    <Label>Expected Project Start Date</Label>
                    <input className="inp" value={form.scope.startDate} onChange={(e) => set('scope.startDate', e.target.value)} placeholder="e.g. Early July 2026" />
                  </div>
                  <div>
                    <Label>Target Completion Date</Label>
                    <input className="inp" value={form.scope.completionDate} onChange={(e) => set('scope.completionDate', e.target.value)} placeholder="e.g. End of September 2026" />
                  </div>
                </div>
              </Section>
            )}

            {current.id === 'investment' && (
              <Section title="Tell us about your budget" sub="This helps us match you to teams within your range.">
                <Label required>How do you want to price this project?</Label>
                <RadioCards
                  options={PRICING.map((p) => ({ value: p }))}
                  value={form.budget.pricingType}
                  onChange={(v) => set('budget.pricingType', v)}
                  columns={2}
                />
                <div className="two-col">
                  <div>
                    <Label>Currency</Label>
                    <select className="inp" value={form.budget.currency} onChange={(e) => set('budget.currency', e.target.value)}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Estimated Cost</Label>
                    <input className="inp" value={form.budget.estimatedCost} onChange={(e) => set('budget.estimatedCost', e.target.value)} placeholder="e.g. £5,000" />
                  </div>
                </div>
                <Label style={{ marginTop: 18 }}>Additional comments on pricing</Label>
                <textarea className="inp area" value={form.budget.comments} onChange={(e) => set('budget.comments', e.target.value)} rows={3} />
              </Section>
            )}

            {current.id === 'description' && (
              <Section title="Describe your project needs" sub="The more detail you provide, the better a team can tailor their proposal.">
                <Label required>Write details for your project</Label>
                <textarea className="inp area tall" value={form.description} onChange={(e) => set('description', e.target.value)} rows={9} />
                <Label style={{ marginTop: 18 }}>Existing assets, access, or documentation to share</Label>
                <textarea className="inp area" value={form.existingAssets} onChange={(e) => set('existingAssets', e.target.value)} rows={3} placeholder="None specified" />
              </Section>
            )}

            {current.id === 'goals' && (
              <Section title="Describe your Project Goals" sub="Help us understand the impact you want to create.">
                <Label required>What does a successful outcome look like for this project?</Label>
                <textarea className="inp area" value={form.projectGoals.impactGoal} onChange={(e) => set('projectGoals.impactGoal', e.target.value)} rows={4} />
                <Label style={{ marginTop: 18 }} required>How will completing this project help your organization in the long run?</Label>
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
              <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>
            ) : <span />}
            {isLast ? (
              <div className="foot-right">
                <button className="btn ghost" onClick={close}>Cancel</button>
                <button className="btn primary" onClick={handleSignup}>Sign up to submit the project</button>
              </div>
            ) : (
              <button className="btn primary" onClick={() => setStep(step + 1)}>Save &amp; Continue</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Review (Step 7) summary, with editable extras ------------------------
function ReviewStep({ form, set, goTo }) {
  const org = form.orgProfile
  const adv = form.advancedTerms
  return (
    <Section title="Review" sub="Review your project details and edit anything before submitting.">
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

      <SummaryCard title="Budget" onEdit={() => goTo(3)}>
        <div className="grid-3">
          <Field icon="$" label="Currency" value={form.budget.currency} />
          <Field icon="▭" label="Payment Type" value={form.budget.pricingType} />
          <Field icon="▥" label="Estimated Cost" value={form.budget.estimatedCost} />
        </div>
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
        <ListEditor items={form.screeningQuestions} placeholder="Write your own question…" onChange={(v) => set('screeningQuestions', v)} />
      </div>

      <div className="card">
        <div className="card-head"><h4>Level of Experience</h4></div>
        <RadioCards options={EXPERIENCE} value={form.levelOfExperience} onChange={(v) => set('levelOfExperience', v)} />
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
            <input className="inp" value={adv.timezone} onChange={(e) => set('advancedTerms.timezone', e.target.value)} placeholder="e.g. GMT (London)" />
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

function RadioCards({ options, value, onChange, columns = 1 }) {
  return (
    <div className={`radio-cards ${columns === 2 ? 'cols-2' : ''}`}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={`radio-card ${value === o.value ? 'selected' : ''}`}
          onClick={() => onChange(o.value)}
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
    <div className={`tag-editor ${atMax ? 'disabled' : ''}`}>
      <div className="tags">
        {items.map((t, i) => (
          <span key={i} className="tag editable">
            {t}
            <button type="button" className="tag-x" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      {!atMax && (
        <input
          className="tag-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={placeholder}
        />
      )}
      {max && <span className="tag-hint">{items.length}/{max} selected</span>}
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

function timeline(scope) {
  if (scope.startDate && scope.completionDate) return `${scope.startDate} → ${scope.completionDate}`
  return scope.startDate || scope.completionDate || 'N/A'
}

// Fill in any missing fields so the editor never hits undefined.
function normalize(d = {}) {
  return {
    title: d.title || '',
    categories: d.categories || [],
    skills: d.skills || [],
    scope: { complexity: '', startDate: '', completionDate: '', ...(d.scope || {}) },
    budget: { pricingType: '', currency: 'GBP', estimatedCost: '', comments: '', ...(d.budget || {}) },
    description: d.description || '',
    existingAssets: d.existingAssets || '',
    projectGoals: { impactGoal: '', impactDescription: '', ...(d.projectGoals || {}) },
    orgProfile: { type: '', size: '', industry: '', location: '', ...(d.orgProfile || {}) },
    screeningQuestions: d.screeningQuestions || [],
    levelOfExperience: d.levelOfExperience || '',
    advancedTerms: { languages: [], timezone: '', ...(d.advancedTerms || {}) },
  }
}
