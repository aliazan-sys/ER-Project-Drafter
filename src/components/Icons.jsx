// Inline SVGs so the drafter stays self-contained inside the Webflow iframe
// (no icon font or CDN request to a host page we don't control).

export function SparkleIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3.5l1.4 3.6 3.6 1.4-3.6 1.4L14 13.5l-1.4-3.6L9 8.5l3.6-1.4z" />
      <path d="M6.5 13.5l.8 2.1 2.2.9-2.2.9-.8 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    </svg>
  )
}

export function ArrowUpIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  )
}

export function ReplyArrowIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5v6a2 2 0 0 0 2 2h13" />
      <path d="M15 9l4 4-4 4" />
    </svg>
  )
}

export function DocIcon({ size = 19 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 15l2 2 3.5-4" />
    </svg>
  )
}

export function ArrowLeftIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  )
}

export function CheckIcon({ size = 12 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export function CloseIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

export function ClockIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function TagIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12.5V4a1 1 0 0 1 1-1h8.5a1 1 0 0 1 .7.3l7 7a1 1 0 0 1 0 1.4l-8.5 8.5a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1-.3-.7z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  )
}

export function PencilIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

// Corner-bracket frame — "Project Size"
export function FrameIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V6a2 2 0 0 1 2-2h3" />
      <path d="M15 4h3a2 2 0 0 1 2 2v3" />
      <path d="M20 15v3a2 2 0 0 1-2 2h-3" />
      <path d="M9 20H6a2 2 0 0 1-2-2v-3" />
    </svg>
  )
}

export function CalendarIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 9.5h18" />
    </svg>
  )
}

export function DollarIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.5v11" />
      <path d="M14.8 9.2A2.6 2 0 0 0 12 7.8c-1.7 0-2.9.9-2.9 2.2s1.2 2 2.9 2 2.9.8 2.9 2.1-1.2 2.2-2.9 2.2a2.6 2 0 0 1-2.8-1.4" />
    </svg>
  )
}

// Card / receipt — "Payment Type"
export function CardIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 15h4" />
    </svg>
  )
}

export function CalculatorIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <path d="M8 6.5h8" />
      <path d="M8.5 11h0M12 11h0M15.5 11h0M8.5 14.5h0M12 14.5h0M15.5 14.5h0M8.5 18h0M12 18h0M15.5 18h0" />
    </svg>
  )
}
