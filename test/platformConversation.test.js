import test from 'node:test'
import assert from 'node:assert/strict'
import {
  callBubbleDraftWorkflow,
  normalizeBubbleId,
  ownershipResponseAuthorized,
  verifyProjectOwnership,
} from '../shared/platformConversation.js'

test('normalizes Bubble IDs used at the API boundary', () => {
  assert.equal(normalizeBubbleId('  project-123  '), 'project-123')
  assert.equal(normalizeBubbleId(null), '')
  assert.equal(normalizeBubbleId('x'.repeat(300)).length, 255)
})

test('accepts Bubble yes/no and boolean ownership responses', () => {
  assert.equal(ownershipResponseAuthorized({ authorized: true }), true)
  assert.equal(ownershipResponseAuthorized({ authorized: 'yes' }), true)
  assert.equal(ownershipResponseAuthorized({ authorized: 'YES' }), true)
  assert.equal(ownershipResponseAuthorized({ status: 'success', response: { authorized: true } }), true)
  assert.equal(ownershipResponseAuthorized({ status: 'success', response: { authorized: 'yes' } }), true)
  assert.equal(ownershipResponseAuthorized({ authorized: false }), false)
  assert.equal(ownershipResponseAuthorized({ authorized: 'no' }), false)
  assert.equal(ownershipResponseAuthorized({ status: 'success', response: { authorized: false } }), false)
})

test('sends Bubble ownership workflow parameter names user_id and project_id', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) }
    return { ok: true, json: async () => ({ status: 'success', response: { authorized: false } }) }
  }
  try {
    assert.equal(await verifyProjectOwnership(' user-123 ', ' project-456 '), false)
    assert.equal(request.url, 'https://admin-83903.bubbleapps.io/api/1.1/wf/project_ownership_verification')
    assert.deepEqual(request.body, { user_id: 'user-123', project_id: 'project-456' })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('keeps server-side workflow calls on live by default and supports explicit development', async () => {
  const originalFetch = globalThis.fetch
  const originalEnvironment = process.env.VITE_BUBBLE_APP_ENV
  let requestUrl = ''
  globalThis.fetch = async (url) => {
    requestUrl = url
    return { ok: true, json: async () => ({ status: 'success' }) }
  }

  try {
    delete process.env.VITE_BUBBLE_APP_ENV
    await callBubbleDraftWorkflow({ u: 'user-123', p: 'project-456' })
    assert.equal(requestUrl, 'https://admin-83903.bubbleapps.io/api/1.1/wf/webhook-draft-project_internal')

    process.env.VITE_BUBBLE_APP_ENV = 'development'
    await verifyProjectOwnership('user-123', 'project-456')
    assert.equal(
      requestUrl,
      'https://admin-83903.bubbleapps.io/version-83k77/api/1.1/wf/project_ownership_verification',
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalEnvironment === undefined) delete process.env.VITE_BUBBLE_APP_ENV
    else process.env.VITE_BUBBLE_APP_ENV = originalEnvironment
  }
})
