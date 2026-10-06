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

// Vite reads this at build time. Development is the temporary checked-in
// default so the production drafter targets the active Bubble branch until
// VITE_BUBBLE_APP_ENV is explicitly switched back to "live".
export const BUBBLE_APP_ENV = import.meta.env?.VITE_BUBBLE_APP_ENV || 'development'
export const BUBBLE_APP_BASE_URL = resolveBubbleAppBaseUrl(BUBBLE_APP_ENV)
export const BUBBLE_WORKFLOW_BASE_URL = resolveBubbleWorkflowBaseUrl(BUBBLE_APP_ENV)

export function bubbleAppUrl(path = '', baseUrl = BUBBLE_APP_BASE_URL) {
  const normalizedPath = String(path).replace(/^\/+/, '')
  return normalizedPath ? `${baseUrl}/${normalizedPath}` : baseUrl
}

export function bubbleWorkflowUrl(path = '', baseUrl = BUBBLE_WORKFLOW_BASE_URL) {
  const normalizedPath = String(path).replace(/^\/+/, '')
  return normalizedPath ? `${baseUrl}/${normalizedPath}` : baseUrl
}
