const WORKFLOW_BASES = {
  live: 'https://admin-83903.bubbleapps.io/api/1.1/wf',
  development: 'https://admin-83903.bubbleapps.io/version-83k77/api/1.1/wf',
}

const MAX_BUBBLE_ID_LENGTH = 255

export function normalizeBubbleId(value) {
  return String(value || '').trim().slice(0, MAX_BUBBLE_ID_LENGTH)
}

export function ownershipResponseAuthorized(value) {
  const authorized = value?.response?.authorized ?? value?.authorized
  return authorized === true || String(authorized || '').toLowerCase() === 'yes'
}

export async function callBubbleDraftWorkflow(payload) {
  const environment = process.env.VITE_BUBBLE_APP_ENV || 'development'
  const baseUrl = WORKFLOW_BASES[environment] || WORKFLOW_BASES.development
  const res = await fetch(`${baseUrl}/webhook-draft-project_internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const message = data?.body?.message || data?.message || data?.error
    throw new Error(message || `Bubble workflow failed (${res.status}).`)
  }
  const data = await res.json().catch(() => ({}))
  if (data?.status && !['success', 'ok'].includes(String(data.status).toLowerCase())) {
    throw new Error(data?.body?.message || data?.message || 'Bubble workflow rejected the project update.')
  }
}

export async function verifyProjectOwnership(userIdValue, projectIdValue) {
  const userId = normalizeBubbleId(userIdValue)
  const projectId = normalizeBubbleId(projectIdValue)
  if (!userId || !projectId) return false

  const environment = process.env.VITE_BUBBLE_APP_ENV || 'development'
  const baseUrl = WORKFLOW_BASES[environment] || WORKFLOW_BASES.development
  const res = await fetch(`${baseUrl}/project_ownership_verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, project_id: projectId }),
  })
  if (!res.ok) return false
  return ownershipResponseAuthorized(await res.json().catch(() => ({})))
}
