export const BUBBLE_APP_ENVIRONMENTS = {
  live: 'https://app.equalreach.io',
  development: 'https://app.equalreach.io/version-83k77',
}

export const BUBBLE_WORKFLOW_ENVIRONMENTS = {
  live: 'https://admin-83903.bubbleapps.io/api/1.1/wf',
  development: 'https://admin-83903.bubbleapps.io/version-83k77/api/1.1/wf',
}

export function resolveBubbleAppBaseUrl(environment = 'live') {
  return BUBBLE_APP_ENVIRONMENTS[environment] || BUBBLE_APP_ENVIRONMENTS.live
}

export function resolveBubbleWorkflowBaseUrl(environment = 'live') {
  return BUBBLE_WORKFLOW_ENVIRONMENTS[environment] || BUBBLE_WORKFLOW_ENVIRONMENTS.live
}

// Vite reads this at build time. Live is the default; set VITE_BUBBLE_APP_ENV
// to "development" only when intentionally targeting the Bubble branch.
export const BUBBLE_APP_ENV = import.meta.env?.VITE_BUBBLE_APP_ENV || 'live'
export const BUBBLE_APP_BASE_URL = resolveBubbleAppBaseUrl(BUBBLE_APP_ENV)
export const BUBBLE_WORKFLOW_BASE_URL = resolveBubbleWorkflowBaseUrl(BUBBLE_APP_ENV)

export function bubbleAppUrl(path = '', baseUrl = BUBBLE_APP_BASE_URL) {
  const normalizedPath = String(path).replace(/^\/+/, '')
  return normalizedPath ? `${baseUrl}/${normalizedPath}` : baseUrl
}

// The staging branch deploys to https://er-project-drafter-git-staging-*.vercel.app.
// Its embed lives in the Bubble development version, so after drafting it must
// send the user to that version; production (and everything else) goes to live.
export function isStagingHost(hostname = '') {
  return /(^|[.-])git-staging-/i.test(String(hostname))
}

export function bubbleProjectRequestUrl(
  projectId,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
) {
  const baseUrl = isStagingHost(hostname)
    ? BUBBLE_APP_ENVIRONMENTS.development
    : BUBBLE_APP_BASE_URL
  return bubbleAppUrl(`/client/project-request/${encodeURIComponent(projectId)}`, baseUrl)
}

export function bubbleWorkflowUrl(path = '', baseUrl = BUBBLE_WORKFLOW_BASE_URL) {
  const normalizedPath = String(path).replace(/^\/+/, '')
  return normalizedPath ? `${baseUrl}/${normalizedPath}` : baseUrl
}
