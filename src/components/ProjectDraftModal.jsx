import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  submitDraftSignup,
  fetchLoginRedirect,
  toDateInputValue,
  formatDisplayDate,
  fetchPlaceSuggestions,
  checkHealth,
  MIN_PLACE_QUERY,
  LOGIN_URL,
  REDIRECT_URL,
  SIGNUP_DUPLICATE,
} from '../lib/api.js'
import { trackStage } from '../lib/tracking.js'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloseIcon, PencilIcon, FrameIcon, CalendarIcon, DollarIcon, CardIcon, CalculatorIcon, ClockIcon, TagIcon } from './Icons.jsx'
import { TIMEZONES } from '../../shared/timezones.js'
import { currencyForLocation } from '../../shared/locationCurrency.js'
import {
  ORG_TYPES,
  ORG_SIZES,
  canonicalOrgType,
  canonicalOrgSize,
} from '../../shared/orgProfile.js'
import { CATEGORIES, MAX_CATEGORIES } from '../../shared/categories.js'

const STEPS = [
  { id: 'title', label: 'Title' },
  { id: 'skills', label: 'Skills' },
  { id: 'scope', label: 'Scope' },
  { id: 'investment', label: 'Investment' },
  { id: 'description', label: 'Description' },
  { id: 'review', label: 'Review' },
]

// Resolve a step by id rather than position. The Review pencils used literal
// indices, which silently misroute the moment a step is added or removed.
const stepIndex = (id) => STEPS.findIndex((s) => s.id === id)

// Where the wizard opens. The draft arrives complete — the AI has already
// answered every step from the conversation — so the user's job is to check it
// over, not to walk the questions again. Opening on Review also means the
// mount effect below marks steps 1–5 as visited, so they show their checkmarks
// straight away. Callers that persist their own step across reopens seed with
// this too.
export const REVIEW_STEP_INDEX = STEPS.findIndex((s) => s.id === 'review')

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
// Icon per pricing type, shown on the price cards (Investment step).
const PRICING_ICON = {
  'Per Unit': ClockIcon,
  'Monthly Rate': ClockIcon,
  'Fixed Price': TagIcon,
  'Not Sure': ClockIcon,
}
// Unit types shown only when pricing is "Per Unit".
const UNIT_TYPES = ['Hour', 'Item', 'Other']
const CURRENCIES = ['GBP', 'EUR', 'USD']
const CURRENCY_SYMBOL = { GBP: '£', EUR: '€', USD: '$' }
// Keep only digits and separators — cost fields are numbers, not free text.
const numericOnly = (s) => String(s ?? '').replace(/[^\d.,]/g, '')
// CATEGORIES / MAX_CATEGORIES are shared with the server (shared/categories.js)
// so the AI can only choose values this form actually offers.
// Fixed list of languages for the Advanced Terms picker.
const LANGUAGES = [
  'Swahili',
  'Arabic',
  'Bengali',
  'Italian',
  'Vietnamese',
  'Turkish',
  'Japanese',
  'Russian',
  'Portuguese',
  'Hindi',
  'Mandarin',
  'German',
  'French',
  'Spanish',
  'English',
]
// ORG_TYPES / ORG_SIZES are shared with the server (shared/orgProfile.js) so
// the AI matches these exact values.
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
  // The modal unmounts on close, so a caller that wants the step remembered
  // holds it and seeds us back. Uncontrolled callers land on Review.
  initialStep = REVIEW_STEP_INDEX,
  onStepChange,
  // Persist which steps have been visited so their checkmarks survive the modal
  // closing and reopening. Uncontrolled callers just start fresh each open.
  initialVisited,
  onVisitedChange,
}) {
  const [form, setForm] = useState(() => normalize(draft))
  // Clamped: a caller can hand back a step index saved before the step list
  // changed, and an out-of-range one makes STEPS[step] undefined — a blank
  // wizard that throws on current.id.
  const [step, setStepState] = useState(
    () => Math.min(Math.max(initialStep | 0, 0), STEPS.length - 1),
  )
  const [signupOpen, setSignupOpen] = useState(false)
  // Only surfaced once they try to move on, so the form doesn't scold on open.
  const [showDateError, setShowDateError] = useState(false)
  const [showOrgError, setShowOrgError] = useState(false)
  const [focusTarget, setFocusTarget] = useState('')
  const wizRef = useRef(null)
  // Steps the user has actually landed on. A step earns its checkmark once it
  // has been visited AND its mandatory inputs are filled — and keeps it when
  // they move away (forward or back), instead of only marking steps < current.
  // Seeded from the caller so the marks survive closing/reopening the modal.
  const [visited, setVisited] = useState(
    () => new Set(initialVisited?.length ? initialVisited : [initialStep]),
  )
  // Whether Location can be verified at all — i.e. whether a Google Maps key is
  // configured on the server. Assumed true so the strict rule is the default;
  // only a definite "no key" relaxes it (see missingOrgFields). AddressChip can
  // also turn it off later if the key turns out to be rejected at runtime.
  const [placesReady, setPlacesReady] = useState(true)

  // The wizard opening means a draft was produced and is being reviewed. A
  // no-op when opened from the history page, where there is no live
  // conversation to attribute it to (see tracking.js).
  useEffect(() => { trackStage('review') }, [])

  useEffect(() => {
    let live = true
    checkHealth().then((h) => {
      if (live && h?.placesConfigured === false) setPlacesReady(false)
    })
    return () => { live = false }
  }, [])

  const setStep = (s) => {
    setStepState(s)
    onStepChange?.(s)
  }

  // Reaching a step marks every earlier step as visited too — jumping from
  // step 1 to step 5 counts 2–4 as seen. Each still only earns a checkmark
  // when its own required fields are filled (see `done` in the stepper).
  useEffect(() => {
    setVisited((prev) => {
      const next = new Set(prev)
      for (let i = 0; i <= step; i++) next.add(i)
      return next.size === prev.size ? prev : next
    })
  }, [step])

  // Hand the visited set back up so a parent can persist it across reopens.
  useEffect(() => {
    onVisitedChange?.([...visited])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visited])

  // A visually disabled submit button remains clickable so it can guide the
  // user. Once its missing field's step renders, bring that exact control into
  // view and focus its first interactive element.
  useEffect(() => {
    if (!focusTarget) return
    const frame = requestAnimationFrame(() => {
      const marker = wizRef.current?.querySelector(`[data-required-field="${focusTarget}"]`)
      if (!marker) return
      marker.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const control = marker.matches('input, textarea, select, button')
        ? marker
        : marker.querySelector('input, textarea, select, button, [tabindex]')
      control?.focus({ preventScroll: true })
      setFocusTarget('')
    })
    return () => cancelAnimationFrame(frame)
  }, [step, focusTarget])

  const missingOrg = missingOrgFields(form, placesReady)
  // A timeline needs one end or the other — or an "Ongoing" retainer, which has
  // no end date by design.
  const hasDate = Boolean(form.scope.startDate || form.scope.completionDate || form.scope.ongoing)
  const firstMissing = firstMissingRequiredField(form, placesReady)

  function close() {
    onSave?.(form)
    onClose()
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
    // This remains clickable while styled as disabled: its job in that state
    // is to take the user directly to the first required field still missing.
    if (firstMissing) {
      if (firstMissing.field === 'timeline') setShowDateError(true)
      if (firstMissing.field === 'location') setShowOrgError(true)
      setStep(stepIndex(firstMissing.step))
      setFocusTarget(firstMissing.field)
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
      <div className="wiz" ref={wizRef}>
        {/* Sidebar stepper */}
        <aside className="wiz-side">
          <div className="wiz-side-title">PROJECT REQUEST</div>
          <ol className="stepper">
            {STEPS.map((s, i) => {
              // A step is "done" once it's been visited and its required
              // inputs are filled — so the check persists when navigating away.
              const done = i !== step && visited.has(i) && isStepComplete(s.id, form, placesReady)
              return (
                <li
                  key={s.id}
                  className={`step ${i === step ? 'active' : ''} ${done ? 'done' : ''}`}
                  onClick={() => setStep(i)}
                >
                  <span className="step-dot">{done && <CheckIcon />}</span>
                  <span className="step-label">{s.label}</span>
                </li>
              )
            })}
          </ol>
        </aside>

          {/* Main panel */}
          <div className="wiz-main">
            <div className="wiz-head">
              <button
                className={`wiz-head-back ${step === 0 ? 'is-hidden' : ''}`}
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
                aria-hidden={step === 0}
                tabIndex={step === 0 ? -1 : 0}
              >
                <ArrowLeftIcon /> Back
              </button>
              <div className="wiz-step-count">
                Step {step + 1} of {STEPS.length}
              {isStepComplete(current.id, form, placesReady) && (
                <span className="step-complete-badge">Step Completed</span>
              )}
            </div>
            <div className="wiz-head-actions">
              <button className="icon-btn" onClick={close} aria-label="Close"><CloseIcon /></button>
            </div>
          </div>

          <div className="wiz-body">
            {current.id === 'title' && (
              <Section title="Write a title for your project" sub="This helps you and your team identify the project later. Keep it short and clear.">
                <Label required>Project Title</Label>
                <input
                  className="inp"
                  data-required-field="title"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Website Re-Design for Growing Brand"
                />
              </Section>
            )}

            {current.id === 'skills' && (
              <Section title="What skills and expertise does your project need?" sub="Select the categories and tools your project requires.">
                <Label required>Choose up to 3 categories that best describe your project</Label>
                <div data-required-field="categories">
                  <SearchMultiSelect
                    items={form.categories}
                    options={CATEGORIES}
                    max={3}
                    placeholder="Choose Category"
                    onChange={(v) => set('categories', v)}
                  />
                </div>
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
                <div data-required-field="complexity">
                  <RadioCards
                    options={COMPLEXITY}
                    value={form.scope.complexity}
                    onChange={(v) => set('scope.complexity', v)}
                  />
                </div>
                {/* Label and its note are one block, so the flex gap doesn't
                    split them apart from each other. */}
                <div>
                  <Label required>When do you expect this to happen?</Label>
                  {!form.scope.ongoing && (
                    <p className="field-note">Fill in at least one — whichever you're surer about.</p>
                  )}
                </div>
                <div className="two-col" data-required-field="timeline">
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
                    {!form.scope.ongoing && (
                      <DateInput
                        value={form.scope.completionDate}
                        invalid={showDateError && !hasDate}
                        onChange={(v) => {
                          set('scope.completionDate', v)
                          setShowDateError(false)
                        }}
                      />
                    )}
                    {/* Monthly retainers are usually open-ended: keep the
                        Ongoing control beneath the completion-date input. */}
                    {form.budget.pricingType === 'Monthly Rate' && (
                      <label className="radio-inline">
                        <input
                          type="radio"
                          checked={!!form.scope.ongoing}
                          onClick={() => {
                            const next = !form.scope.ongoing
                            set('scope.ongoing', next)
                            if (next) set('scope.completionDate', '')
                            setShowDateError(false)
                          }}
                          onChange={() => {}}
                        />
                        <span>Ongoing</span>
                      </label>
                    )}
                  </div>
                </div>
                {showDateError && !hasDate && (
                  <p className="field-error">
                    ⚠️ Please add either a start date or a completion date to continue.
                  </p>
                )}
              </Section>
            )}

            {current.id === 'investment' && (() => {
              const b = form.budget
              const isPerUnit = b.pricingType === 'Per Unit'
              const isMonthly = b.pricingType === 'Monthly Rate'
              const isFixed = b.pricingType === 'Fixed Price'
              // "Not Sure" (and no selection) hide the range entirely.
              const showRange = isPerUnit || isMonthly || isFixed
              const rangeSuffix = isMonthly
                ? '/month'
                : isPerUnit
                  ? `/${(b.unitType || '').toLowerCase()}`
                  : ''
              const noRange = !b.estimatedCostFrom && !b.estimatedCostTo
              const showUnitError = isPerUnit && !b.unitType
              const showRangeError = showRange && noRange && (isMonthly || isFixed || (isPerUnit && b.unitType))
              return (
                <Section title="Tell us about your budget" sub="This will help us match you to the teams within your range">
                  <Label required>How do you want to price this project?</Label>
                  <div data-required-field="pricing">
                    <RadioCards
                      options={PRICING.map((p) => {
                        const Icon = PRICING_ICON[p]
                        return { value: p, icon: <Icon /> }
                      })}
                      value={b.pricingType}
                      onChange={(v) => set('budget.pricingType', v)}
                      columns={2}
                    />
                  </div>

                  <div>
                    <Label>Select a currency</Label>
                    <select className="inp" value={b.currency} onChange={(e) => set('budget.currency', e.target.value)}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Per Unit: pick what a "unit" means before the range. */}
                  {isPerUnit && (
                    <div data-required-field="unit">
                      <Label required>Per unit setting (unit type):</Label>
                      <RadioCards
                        options={UNIT_TYPES.map((u) => ({ value: u }))}
                        value={b.unitType}
                        onChange={(v) => set('budget.unitType', v)}
                        columns={3}
                      />
                      {showUnitError && <p className="field-required">Project unit type is required</p>}
                    </div>
                  )}

                  {/* Range shown for every priced option except "Not Sure". */}
                  {showRange && (
                    <div data-required-field="range">
                      <Label required>Investment Range?</Label>
                      <p className="field-note">Enter at least one value (From or To)</p>
                      <div className="two-col">
                        <div>
                          <Label>From</Label>
                          <RangeInput
                            value={b.estimatedCostFrom}
                            onChange={(v) => set('budget.estimatedCostFrom', v)}
                            placeholder={isPerUnit ? '15' : '500'}
                            suffix={rangeSuffix}
                          />
                        </div>
                        <div>
                          <Label>To</Label>
                          <RangeInput
                            value={b.estimatedCostTo}
                            onChange={(v) => set('budget.estimatedCostTo', v)}
                            placeholder={isPerUnit ? '35' : '800'}
                            suffix={rangeSuffix}
                          />
                        </div>
                      </div>
                      {showRangeError && (
                        <p className="field-required">Project rate range is required (enter at least one value)</p>
                      )}
                    </div>
                  )}

                  <Label>Do you have any additional comments on pricing?</Label>
                  <textarea className="inp area" value={b.comments} onChange={(e) => set('budget.comments', e.target.value)} rows={3} placeholder="Anything teams should know about budget or scope…" />
                </Section>
              )
            })()}

            {current.id === 'description' && (
              <Section title="Describe your project" sub="The more detail you give, the better your proposals will be.">
                <Label required>Project description</Label>
                <textarea data-required-field="description" className="inp area tall" value={form.description} onChange={(e) => set('description', e.target.value)} rows={9} />
                <Label>Existing assets, access, or documentation to share</Label>
                <textarea className="inp area" value={form.existingAssets} onChange={(e) => set('existingAssets', e.target.value)} rows={3} placeholder="None specified" />
              </Section>
            )}

            {current.id === 'review' && (
              <ReviewStep
                form={form}
                set={set}
                goTo={setStep}
                missingOrg={showOrgError ? missingOrg : []}
                onPlacesUnsupported={() => setPlacesReady(false)}
              />
            )}
          </div>

          {/* Footer nav */}
          <div className="wiz-foot">
            {step > 0 ? (
              <button className="btn ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeftIcon /> Back
              </button>
            ) : <span className="wiz-foot-spacer" />}
            {isLast ? (
              <div className="foot-right">
                <button className="btn plain" onClick={close}>Cancel</button>
                <button
                  className={`btn primary ${firstMissing ? 'guidance-disabled' : ''}`}
                  aria-disabled={Boolean(firstMissing)}
                  title={firstMissing ? 'Complete the required fields before signing up' : undefined}
                  onClick={handleSignup}
                >
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
const MIN_PASSWORD = 8

function SignupModal({ draft, onClose }) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [organizationName, setOrganizationName] = useState(() => draft?.orgProfile?.name || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [error, setError] = useState('')

  // Reaching the signup form is its own funnel stage: everyone here has an
  // approved draft and is one form away from converting, so abandoning at this
  // point means something different from abandoning during the conversation.
  useEffect(() => { trackStage('signup') }, [])

  const emailValid =/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  // Not trimmed: leading/trailing spaces are legitimate password characters,
  // and silently stripping them would break the login they just set up.
  const passwordValid = password.length >= MIN_PASSWORD
  const valid =
    emailValid &&
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    organizationName.trim() !== '' &&
    passwordValid

  async function submit(e) {
    e?.preventDefault()
    if (!valid || status === 'submitting') return
    setStatus('submitting')
    setError('')
    // The funnel's finish line is pressing this button with a valid form —
    // reported here, before the await, because what follows ends in a redirect
    // away from the page and may resolve only after we have already left.
    trackStage('completed')
    try {
      // The payload goes out immediately; the only thing we wait on is the
      // duplicate-email verdict, which decides where they land. Anything else
      // — slow workflow, network error — resolves to "proceed" (see
      // submitDraftSignup), so this never blocks for longer than that check.
      const { outcome } = submitDraftSignup(email.trim(), draft, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        organizationName: organizationName.trim(),
        password,
      })
      const verdict = await outcome
      // Show "You're all set!" before logging in, so the success screen covers
      // that second round-trip instead of the button sitting on "Submitting…".
      setStatus('done')

      let url = LOGIN_URL
      if (verdict !== SIGNUP_DUPLICATE) {
        // The account exists now, so log them in and let the web app hand back
        // where to send them. A duplicate email skips this: the password they
        // just typed is unlikely to be that existing account's password, so
        // they authenticate normally instead.
        //
        // Falls back to the plain redirect if the login doesn't answer with a
        // destination — their account and draft are already saved either way.
        url = (await fetchLoginRedirect(email.trim(), password)) || REDIRECT_URL
      }
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
    // No onClick on the overlay: a stray click outside must not discard the
    // form. Closing goes through the X (or Cancel) only.
    <div className="modal-overlay">
      <div className="signup-card">
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
              Enter your details and we'll create your EqualReach account with this project draft
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

            <label className="flabel" htmlFor="signup-org" style={{ marginTop: 18 }}>Organization name <span className="req">*</span></label>
            <input
              id="signup-org"
              className="inp"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Example Charity"
              autoComplete="organization"
              disabled={status === 'submitting'}
            />

            <label className="flabel" htmlFor="signup-email" style={{ marginTop: 18 }}>Email address <span className="req">*</span></label>
            <input
              id="signup-email"
              className="inp"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              disabled={status === 'submitting'}
            />

            <label className="flabel" htmlFor="signup-password" style={{ marginTop: 18 }}>Password <span className="req">*</span></label>
            <div className="pw-wrap">
              <input
                id="signup-password"
                className="inp pw-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                // new-password, not current-password: this creates the account,
                // so browsers should offer to generate and save rather than
                // autofill an existing credential.
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                disabled={status === 'submitting'}
                aria-describedby="signup-password-hint"
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((v) => !v)}
                disabled={status === 'submitting'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="signup-hint" id="signup-password-hint">
              {/* Only nags once they have started typing — an untouched field
                  showing an error reads as a complaint about nothing. */}
              {password && !passwordValid
                ? `Use at least ${MIN_PASSWORD} characters — that's ${MIN_PASSWORD - password.length} more.`
                : `This is the password you'll use to log in to EqualReach.`}
            </p>

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
            <p className="signup-fine signup-login">
              Already have an account?{' '}
              <a href={LOGIN_URL} target="_blank" rel="noopener noreferrer">Log in here</a>.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

// --- Review (Step 7) summary, with editable extras ------------------------
// `missingOrg` carries the labels of blank required org fields, but only once
// the user has tried to submit — an empty array means "say nothing yet".
function ReviewStep({ form, set, goTo, missingOrg = [], onPlacesUnsupported }) {
  const org = form.orgProfile
  const adv = form.advancedTerms
  const flagged = (label) => missingOrg.some((p) => p.label === label)
  const empties = missingOrg.filter((p) => p.reason === 'empty').map((p) => p.label)
  const unverifiedLocation = missingOrg.some((p) => p.reason === 'unverified')
  return (
    <Section title="Review" sub="Review your project details and submit when you're ready.">
      <div className="org-head">
        <h4>Your Organization Profile Summary <span className="req">*</span></h4>
        <span className="info-dot" tabIndex={0}>
          i
          <span className="info-tip" role="tooltip">
            The anonymized overview of your organization will be shared in the project request
          </span>
        </span>
      </div>
      <div className="chip-row">
        <SelectChip
          label="Type"
          value={org.type}
          options={ORG_TYPES}
          allowEmpty
          onChange={(v) => set('orgProfile.type', v)}
        />
        <SelectChip
          label="Size"
          value={org.size}
          options={ORG_SIZES}
          allowEmpty
          onChange={(v) => set('orgProfile.size', v)}
        />
        <EditChip label="Industry" value={org.industry} invalid={flagged('Industry')} onChange={(v) => set('orgProfile.industry', v)} />
        <AddressChip
          label="Location"
          focusId="location"
          value={org.location}
          // Verified means "this exact string is one Google returned" — editing
          // a single character of a picked address makes it unverified again.
          verified={Boolean(org.location) && org.location === org.locationVerified}
          invalid={flagged('Location')}
          onChange={(v, isVerified) => {
            set('orgProfile.location', v)
            set('orgProfile.locationVerified', isVerified ? v : '')
            set('budget.currency', currencyForLocation(v))
          }}
          onUnsupported={onPlacesUnsupported}
        />
      </div>
      {empties.length > 0 && (
        <p className="field-error">
          ⚠️ Please add your organisation's location before submitting.
        </p>
      )}
      {unverifiedLocation && (
        <p className="field-error">
          ⚠️ Location must be a real address — pick one from the suggestions as you
          type. Answers like “remote”, “worldwide” or “N/A” can't be accepted.
        </p>
      )}

      <SummaryCard title="Project Title" onEdit={() => goTo(stepIndex('title'))}>
        <p className="strong">{form.title || '—'}</p>
      </SummaryCard>

      {/* Category, Skills, Scope and Budget share one card, each as its own
          row with its own edit pencil (matches the platform review layout). */}
      <section className="card summary-group">
        <SummaryRow title="Category" onEdit={() => goTo(stepIndex('skills'))}>
          {form.categories?.length
            ? <p>{form.categories.join(', ')}</p>
            : <p className="muted">No categories</p>}
        </SummaryRow>

        <SummaryRow title="Skills" onEdit={() => goTo(stepIndex('skills'))}>
          <TagList items={form.skills} empty="No skills" />
        </SummaryRow>

        <SummaryRow title="Scope" onEdit={() => goTo(stepIndex('scope'))}>
          <div className="grid-2">
            <Field icon={<FrameIcon />} label="Project Size" value={form.scope.complexity} />
            <Field icon={<CalendarIcon />} label="Timeline" value={timeline(form.scope)} />
          </div>
        </SummaryRow>

        <SummaryRow title="Budget" onEdit={() => goTo(stepIndex('investment'))}>
          <div className="grid-3">
            <Field icon={<DollarIcon />} label="Currency" value={form.budget.currency} />
            <Field icon={<CardIcon />} label="Payment Type" value={form.budget.pricingType} />
            <Field icon={<CalculatorIcon />} label="Estimated Cost" value={costRange(form.budget)} />
          </div>
          {/* Optional field — an empty one is noise on the summary. */}
          {form.budget.comments?.trim() && (
            <div className="subfield">
              <span className="sub-label">Additional Comments on Pricing</span>
              <p>{form.budget.comments}</p>
            </div>
          )}
        </SummaryRow>
      </section>

      <SummaryCard title="Description" onEdit={() => goTo(stepIndex('description'))}>
        <Paragraphs text={form.description} />
        <div className="subfield">
          <span className="sub-label">Additional Assets Client Will Provide</span>
          <p>{form.existingAssets || 'None specified'}</p>
        </div>
      </SummaryCard>

      <h3 className="section-title">Additional Information</h3>

      <div className="card">
        <div className="card-head"><h4>Screening Questions <span className="opt">(optional)</span></h4></div>
        <p className="card-note">Narrow down your team selection</p>
        <ScreeningQuestions
          items={form.screeningQuestions}
          suggestions={form.suggestedQuestions}
          onChange={(v) => set('screeningQuestions', v)}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h4>Level of Experience <span className="opt">(optional)</span></h4>
          {form.levelOfExperience && (
            <button className="link-btn" onClick={() => set('levelOfExperience', '')}>
              Clear
            </button>
          )}
        </div>
        <p className="card-note">Narrow down your team selection</p>
        <p className="field-note">Select the level of experience your project requires.</p>
        <RadioCards
          options={EXPERIENCE}
          value={form.levelOfExperience}
          onChange={(v) => set('levelOfExperience', v)}
          clearable
        />
      </div>

      <div className="card">
        <div className="card-head"><h4>Advanced terms <span className="opt">(optional)</span></h4></div>
        <p className="card-note">Narrow down your team selection</p>
        <div className="stack">
          <div>
            <Label>Language</Label>
            <SearchMultiSelect
              items={adv.languages}
              options={LANGUAGES}
              placeholder="Choose Languages"
              closeOnSelect
              onChange={(v) => set('advancedTerms.languages', v)}
            />
          </div>
          <div>
            <Label>Timezone you prefer for working</Label>
            <SearchMultiSelect
              items={adv.timezone}
              options={TIMEZONES}
              placeholder="Choose Timezones"
              closeOnSelect
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
  const iso = toDateInputValue(value)
  // The whole field opens the calendar: the browser's native picker indicator
  // is stretched over the entire input via CSS. We avoid showPicker() because
  // it's blocked inside cross-origin iframes (the Webflow embed), where only
  // the native indicator click works.
  return (
    <div className={`date-input ${invalid ? 'invalid' : ''}`}>
      <input
        type="date"
        className="date-input-native"
        value={iso}
        onChange={(e) => onChange(e.target.value)}
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
    <div className={`radio-cards ${columns === 2 ? 'cols-2' : ''} ${columns === 3 ? 'cols-3' : ''}`}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={`radio-card ${value === o.value ? 'selected' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(clearable && value === o.value ? '' : o.value)}
        >
          <span className="radio-mark" />
          {o.icon && <span className="radio-icon">{o.icon}</span>}
          <span>
            <span className="radio-title">{o.value}</span>
            {o.desc && <span className="radio-desc">{o.desc}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

// Numeric range field with a unit suffix outside the box (e.g. "/month").
function RangeInput({ value, onChange, placeholder, suffix }) {
  return (
    <div className="range-input">
      <input
        className="inp"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(numericOnly(e.target.value))}
        placeholder={placeholder}
      />
      {suffix && <span className="range-suffix">{suffix}</span>}
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

// A searchable multi-select: click to open the option list, type to filter
// (the typed text stays visible), click options to add them as removable chips.
// Restricted to `options` and capped at `max`.
function SearchMultiSelect({ items = [], options, onChange, placeholder, max, closeOnSelect = false }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const atMax = max && items.length >= max
  const query = text.trim().toLowerCase()
  const filtered = options.filter(
    (o) => !items.includes(o) && o.toLowerCase().includes(query),
  )

  // Close the menu when clicking outside the widget.
  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(o) {
    if (atMax || items.includes(o)) return
    onChange([...items, o])
    setText('')
    setOpen(!closeOnSelect)
  }

  return (
    <div className="tag-editor">
      <div className="ms" ref={boxRef}>
        <input
          className="inp"
          value={text}
          disabled={atMax}
          placeholder={atMax ? `Up to ${max} — remove one to add another` : placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => { setText(e.target.value); setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length) { e.preventDefault(); pick(filtered[0]) }
            else if (e.key === 'Escape') setOpen(false)
          }}
        />
        {open && !atMax && filtered.length > 0 && (
          <ul className="ms-menu">
            {filtered.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  className="ms-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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

// Like TagEditor, but picks come from a fixed list instead of free text — the
// selected values render as removable chips and the dropdown resets each time.
function MultiSelect({ items = [], options, onChange, placeholder, max }) {
  const remaining = options.filter((o) => !items.includes(o))
  const atMax = max && items.length >= max
  return (
    <div className="tag-editor">
      <select
        className="inp"
        value=""
        disabled={atMax || remaining.length === 0}
        onChange={(e) => e.target.value && !atMax && onChange([...items, e.target.value])}
      >
        <option value="">
          {atMax ? `Up to ${max} — remove one to add another` : placeholder}
        </option>
        {!atMax && remaining.map((o) => <option key={o} value={o}>{o}</option>)}
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

// Screening questions: the AI's questions are shown as SUGGESTIONS the user
// opts into with "+", and they can type their own. Added questions show above
// the suggestions with an "×" to remove; a removed suggestion returns to the
// suggestion list.
function ScreeningQuestions({ items = [], suggestions = [], onChange }) {
  const [text, setText] = useState('')
  const remaining = suggestions.filter((q) => !items.includes(q))
  function add(q) {
    const v = (q ?? text).trim()
    if (!v || items.includes(v)) return
    onChange([...items, v])
    if (q == null) setText('')
  }
  return (
    <div>
      <div className="sq-add">
        <input
          className="inp"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Write your own questions"
        />
        <button type="button" className="btn ghost small sq-add-btn" onClick={() => add()}>+ Add</button>
      </div>

      {items.length > 0 && (
        <ul className="sq-added">
          {items.map((q, i) => (
            <li key={i}>
              <button
                type="button"
                className="sq-remove"
                aria-label={`Remove ${q}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      )}

      {remaining.length > 0 && (
        <div className="sq-suggest">
          <div className="sq-suggest-title">Suggested question</div>
          <p className="sq-suggest-sub">You might want to ask these questions</p>
          <ul className="sq-suggest-list">
            {remaining.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  className="sq-plus"
                  aria-label={`Add ${q}`}
                  onClick={() => add(q)}
                >
                  +
                </button>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EditChip({ label, value, invalid, onChange }) {
  return (
    <div className={`chip ${invalid ? 'is-invalid' : ''}`}>
      <span className="chip-label">{label}</span>
      <input
        className="chip-input chip-edit-input"
        value={value || ''}
        placeholder="Enter industry…"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

// How long the field stays quiet after a keystroke before asking Google. Each
// lookup is a billed request, so this is a cost control as much as a UX one:
// typing "London" fires once, not six times.
const ADDRESS_DEBOUNCE_MS = 300

// Like EditChip, but for a geographic address: typing suggests real places
// (street addresses, cities, regions — never businesses) from the Google Places
// API, proxied through /api/places so the key stays server-side.
//
// Typing is search, not entry: `onChange(value, verified)` reports whether what
// the field holds came from Google. Only a picked suggestion is verified, and
// only a verified value passes validation — so "remote" or "N/A" can be typed
// but never submitted. If no Maps key is configured the field degrades to the
// plain text input it was before, and the caller relaxes the rule to match.
function AddressChip({ label, focusId, value, invalid, verified, onChange, onUnsupported }) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Flipped off for good the first time the server says it has no Maps key,
  // so an unconfigured deployment makes one lookup, not one per keystroke.
  const [supported, setSupported] = useState(true)
  // Only what the USER typed is looked up. Without this, a draft that arrives
  // with a location already filled would open a menu the moment it renders.
  const typedRef = useRef(false)
  const boxRef = useRef(null)
  const menuRef = useRef(null)
  const [menuStyle, setMenuStyle] = useState({})

  function positionMenu() {
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const viewportPadding = 8
    const width = Math.min(420, Math.max(260, rect.width), window.innerWidth - viewportPadding * 2)
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - width, window.innerWidth - width - viewportPadding),
    )
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      right: 'auto',
      width,
    })
  }

  useEffect(() => {
    if (!supported || !typedRef.current) return
    const q = String(value || '').trim()
    if (q.length < MIN_PLACE_QUERY) {
      setItems([])
      setOpen(false)
      return
    }

    let cancelled = false
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const { suggestions, configured } = await fetchPlaceSuggestions(q, { signal: ctrl.signal })
        if (cancelled) return
        if (!configured) {
          setSupported(false)
          setItems([])
          // Tell the wizard too: with no working key there is no dropdown to
          // pick from, so it must stop demanding a verified value.
          onUnsupported?.()
          return
        }
        setItems(suggestions)
        setActive(-1)
        setOpen(suggestions.length > 0)
      } catch {
        // Aborted by a newer keystroke — the next run owns the menu.
      }
    }, ADDRESS_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [value, supported])

  // Close the menu when clicking outside the chip.
  useEffect(() => {
    function onDoc(e) {
      const outsideInput = boxRef.current && !boxRef.current.contains(e.target)
      const outsideMenu = !menuRef.current || !menuRef.current.contains(e.target)
      if (outsideInput && outsideMenu) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // The suggestions are portalled outside the wizard's clipped scroll area.
  // Keep the fixed overlay attached to the Location input while anything
  // underneath it scrolls or resizes.
  useEffect(() => {
    if (!open) return
    positionMenu()
    const reposition = () => positionMenu()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  function pick(s) {
    // Picking is not typing: clear the flag first so the value change below
    // doesn't immediately look the chosen address up again.
    typedRef.current = false
    onChange(s.value, true)
    setItems([])
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') return setOpen(false)
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      // Enter only commits a highlighted suggestion — otherwise it stays free
      // text, and the form's own Enter handling is left alone.
      if (active >= 0) {
        e.preventDefault()
        pick(items[active])
      }
    }
  }

  const listId = `addr-menu-${label.toLowerCase()}`
  return (
    <div
      className={`chip chip-address ${invalid ? 'is-invalid' : ''}`}
      data-required-field={focusId}
      ref={boxRef}
    >
      <span className="chip-label">
        {label}
        {verified && (
          <span className="chip-verified" role="img" aria-label="Address confirmed">✓</span>
        )}
      </span>
      <input
        className="chip-input"
        value={value || ''}
        // Browsers autofill saved addresses over a field named like this one;
        // "off" keeps the Google menu the only dropdown on screen.
        autoComplete="off"
        placeholder={supported ? 'Start typing an address…' : ''}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          typedRef.current = true
          // Typed text is unverified by definition. Without a working key
          // there is nothing to verify against, so it counts as entered.
          onChange(e.target.value, !supported)
        }}
        onFocus={() => { if (items.length) setOpen(true) }}
        onKeyDown={onKeyDown}
      />
      {open && items.length > 0 && createPortal(
        <ul
          className="ms-menu chip-menu chip-menu-portal"
          id={listId}
          role="listbox"
          ref={menuRef}
          style={menuStyle}
        >
          {items.map((s, i) => (
            <li key={s.id || s.value} role="presentation">
              <button
                type="button"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`ms-option addr-option ${i === active ? 'is-active' : ''}`}
                // Keep focus in the input so the blur/outside-click handlers
                // don't close the menu before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
              >
                <span className="addr-main">{s.main}</span>
                {s.secondary && <span className="addr-sub">{s.secondary}</span>}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  )
}

// Like EditChip, but the value is picked from a fixed list. Only the predefined
// options are offered — an off-list value is never added to the dropdown. When
// nothing is selected it shows a "Select…" prompt rather than defaulting to the
// first option, so an unanswered field never looks pre-filled.
function SelectChip({ label, value, options, invalid, disabled = false, allowEmpty = false, onChange }) {
  return (
    <div className={`chip ${invalid ? 'is-invalid' : ''}`}>
      <span className="chip-label">{label}</span>
      <select
        className={`chip-input chip-select ${value ? '' : 'is-empty'}`}
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled={!allowEmpty} hidden={!allowEmpty}>
          {allowEmpty ? 'Not specified' : 'Select…'}
        </option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function SummaryCard({ title, onEdit, children }) {
  return (
    <section className="card">
      <div className="card-head">
        <h4>{title}</h4>
        <button className="edit-pencil" onClick={onEdit} title="Edit this section"><PencilIcon /></button>
      </div>
      {children}
    </section>
  )
}

// One section inside the grouped summary card: a title with its own edit
// pencil, then the content below it.
function SummaryRow({ title, onEdit, children }) {
  return (
    <div className="sum-row">
      <div className="sum-row-head">
        <h4>{title}</h4>
        <button className="edit-pencil" onClick={onEdit} title="Edit this section"><PencilIcon /></button>
      </div>
      {children}
    </div>
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

// Whether a step's mandatory inputs are all filled. Mirrors the `required`
// fields in each step's markup — keep the two in sync.
function isStepComplete(id, form, placesReady = true) {
  switch (id) {
    case 'title':
      return Boolean(form.title?.trim())
    case 'skills':
      return (form.categories?.length ?? 0) > 0
    case 'scope':
      return Boolean(form.scope?.complexity) &&
        Boolean(form.scope?.startDate || form.scope?.completionDate || form.scope?.ongoing)
    case 'investment': {
      const b = form.budget || {}
      if (!b.pricingType) return false
      if (b.pricingType === 'Not Sure') return true
      const hasRange = Boolean(b.estimatedCostFrom || b.estimatedCostTo)
      // Per Unit also needs a unit type; the rest just need a range value.
      if (b.pricingType === 'Per Unit') return Boolean(b.unitType) && hasRange
      return hasRange
    }
    case 'description':
      return Boolean(form.description?.trim())
    case 'review':
      // Review is only complete once the org profile is, since that block is
      // the one thing on this step the user still has to supply.
      return missingOrgFields(form, placesReady).length === 0
    default:
      return false
  }
}

// Required fields in the same order the wizard presents them. This powers the
// final button's disabled appearance and its click-to-fix guidance.
function firstMissingRequiredField(form, placesReady = true) {
  if (!form.title?.trim()) return { step: 'title', field: 'title' }
  if (!(form.categories?.length > 0)) return { step: 'skills', field: 'categories' }
  if (!form.scope?.complexity) return { step: 'scope', field: 'complexity' }
  if (!(form.scope?.startDate || form.scope?.completionDate || form.scope?.ongoing)) {
    return { step: 'scope', field: 'timeline' }
  }

  const budget = form.budget || {}
  if (!budget.pricingType) return { step: 'investment', field: 'pricing' }
  if (budget.pricingType === 'Per Unit' && !budget.unitType) {
    return { step: 'investment', field: 'unit' }
  }
  if (
    budget.pricingType !== 'Not Sure' &&
    !budget.estimatedCostFrom &&
    !budget.estimatedCostTo
  ) {
    return { step: 'investment', field: 'range' }
  }

  if (!form.description?.trim()) return { step: 'description', field: 'description' }
  if (missingOrgFields(form, placesReady).length > 0) {
    return { step: 'review', field: 'location' }
  }
  return null
}

// Returns a problem per unusable field, in display order:
//   { key, label, reason: 'empty' | 'unverified' }
//
// Location is held to a higher bar than the rest. It is a geographic address,
// so "remote", "worldwide" or "N/A" are not answers to it — the value must be
// one Google Places confirmed, which `orgProfile.locationVerified` records.
// The AI path sets that server-side after resolving; the user path sets it by
// picking from the dropdown. Any other text leaves the two out of step and the
// field unusable, which is the point: there is no way to hand-type your way
// past it.
//
// `placesReady` is the escape hatch. With no Maps key (or a broken one) there
// is no dropdown to pick from, so demanding a verified value would make the
// form permanently unsubmittable. In that state Location falls back to
// "non-empty", exactly as it behaved before autocomplete existed.
function missingOrgFields(form, placesReady = true) {
  const org = form?.orgProfile || {}
  // Type is fixed to Solo Business for an Individual; Size and Industry remain
  // optional. Location is required for every submitter.

  const location = String(org.location ?? '').trim()
  if (!location) return [{ key: 'location', label: 'Location', reason: 'empty' }]
  if (placesReady && location !== String(org.locationVerified ?? '').trim()) {
    return [{ key: 'location', label: 'Location', reason: 'unverified' }]
  }
  return []
}

function costRange(budget) {
  const sym = CURRENCY_SYMBOL[budget.currency] || ''
  const from = numericOnly(budget.estimatedCostFrom)
  const to = numericOnly(budget.estimatedCostTo)
  if (from && to) return `${sym}${from} – ${sym}${to}`
  if (from) return `${sym}${from}`
  if (to) return `${sym}${to}`
  return 'N/A'
}

function timeline(scope) {
  const from = formatDisplayDate(scope.startDate)
  const to = scope.ongoing ? 'Ongoing' : formatDisplayDate(scope.completionDate)
  if (from && to) return `${from} → ${to}`
  return from || to || 'N/A'
}

// Fill in any missing fields so the editor never hits undefined.
function normalize(d = {}) {
  const normalizedOrgType = canonicalOrgType(d.orgProfile?.type)
  const hasOrgType = Object.prototype.hasOwnProperty.call(d.orgProfile || {}, 'type')
  const submittingAs = d.orgProfile?.submittingAs === 'Individual' || normalizedOrgType === 'Solo Business'
    ? 'Individual'
    : 'Organisation'
  return {
    title: d.title || '',
    // Last line of defence for categories: the schema enum and the prompt both
    // constrain the model, but a stored draft from before those landed — or any
    // slip past them — must not show up as a selected chip the user could never
    // have picked. Drop anything off-list, de-duplicate, and hold to the cap.
    categories: [...new Set(d.categories || [])]
      .filter((c) => CATEGORIES.includes(c))
      .slice(0, MAX_CATEGORIES),
    skills: d.skills || [],
    scope: {
      complexity: '',
      ...(d.scope || {}),
      // The model writes prose dates ("Mid-August 2026"); the picker needs
      // yyyy-mm-dd. Canonicalize once here so everything downstream agrees.
      startDate: toDateInputValue(d.scope?.startDate),
      // Monthly retainers default to "Ongoing" (no end date). We don't keep an
      // AI-generated completion date for them — only a date the user set later
      // (saved as ongoing: false) survives.
      ongoing: d.scope?.ongoing ?? (d.budget?.pricingType === 'Monthly Rate'),
      completionDate: (d.scope?.ongoing ?? (d.budget?.pricingType === 'Monthly Rate'))
        ? ''
        : toDateInputValue(d.scope?.completionDate),
    },
    budget: {
      pricingType: '',
      unitType: '',
      costEstimated: false,
      comments: '',
      ...(d.budget || {}),
      // Only GBP/EUR/USD are supported (matches the Bubble currency Option Set).
      currency: currencyForLocation(d.orgProfile?.location),
      // The symbol is rendered by the field itself, so store just the number.
      estimatedCostFrom: numericOnly(d.budget?.estimatedCostFrom),
      estimatedCostTo: numericOnly(d.budget?.estimatedCostTo),
    },
    description: d.description || '',
    existingAssets: d.existingAssets || '',
    orgProfile: {
      submittingAs,
      name: '', industry: '', location: '',
      // Set by the server when it resolved the AI's location against Google,
      // or by the Location chip when the user picks a suggestion. Location
      // only counts as answered while these two match — see missingOrgFields.
      locationVerified: '',
      ...(d.orgProfile || {}),
      // Type & Size are fixed dropdowns — drop any AI value that's off-list,
      // and migrate values this app used to offer under a different wording.
      // New Individual drafts arrive as Solo Business, but once the review is
      // open the unlocked optional field may be changed or explicitly cleared.
      type: submittingAs === 'Individual' && !hasOrgType ? 'Solo Business' : normalizedOrgType,
      size: canonicalOrgSize(d.orgProfile?.size),
    },
    // The AI's questions are SUGGESTIONS the user opts into — they don't get
    // added automatically. On a fresh draft `screeningQuestions` starts empty
    // and the AI list seeds `suggestedQuestions`; a reopened draft (which
    // already carries `suggestedQuestions`) keeps whatever the user added.
    suggestedQuestions: d.suggestedQuestions ?? (d.screeningQuestions || []),
    screeningQuestions: d.suggestedQuestions !== undefined ? (d.screeningQuestions || []) : [],
    levelOfExperience: d.levelOfExperience || '',
    advancedTerms: {
      ...(d.advancedTerms || {}),
      // Bubble types these as lists. Accept a bare string too (older drafts,
      // or a model that ignored the schema) and drop anything off-list, so we
      // only ever keep values from the predefined Option Sets.
      languages: [d.advancedTerms?.languages].flat().filter((l) => LANGUAGES.includes(l)),
      timezone: [d.advancedTerms?.timezone].flat().filter((tz) => TIMEZONES.includes(tz)),
    },
  }
}
