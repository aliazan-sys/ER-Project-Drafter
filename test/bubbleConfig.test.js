import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUBBLE_APP_ENV,
  BUBBLE_APP_ENVIRONMENTS,
  BUBBLE_WORKFLOW_ENVIRONMENTS,
  bubbleAppUrl,
  bubbleWorkflowUrl,
  resolveBubbleAppBaseUrl,
  resolveBubbleWorkflowBaseUrl,
} from '../src/lib/bubbleConfig.js'

test('defaults builds to the current development Bubble environment', () => {
  assert.equal(BUBBLE_APP_ENV, 'development')
})

test('resolves live and development Bubble app branches', () => {
  assert.equal(resolveBubbleAppBaseUrl('live'), 'https://app.equalreach.io')
  assert.equal(
    resolveBubbleAppBaseUrl('development'),
    'https://app.equalreach.io/version-83k77',
  )
  assert.equal(resolveBubbleAppBaseUrl('unknown'), BUBBLE_APP_ENVIRONMENTS.live)
})

test('resolves live and development Bubble workflow API bases', () => {
  assert.equal(
    resolveBubbleWorkflowBaseUrl('live'),
    'https://admin-83903.bubbleapps.io/api/1.1/wf',
  )
  assert.equal(
    resolveBubbleWorkflowBaseUrl('development'),
    'https://admin-83903.bubbleapps.io/version-83k77/api/1.1/wf',
  )
  assert.equal(
    resolveBubbleWorkflowBaseUrl('unknown'),
    BUBBLE_WORKFLOW_ENVIRONMENTS.live,
  )
})

test('builds Bubble navigation URLs from the selected base', () => {
  assert.equal(
    bubbleAppUrl('/client/proposals', BUBBLE_APP_ENVIRONMENTS.development),
    'https://app.equalreach.io/version-83k77/client/proposals',
  )
})

test('builds workflow URLs from the selected Bubble environment', () => {
  assert.equal(
    bubbleWorkflowUrl(
      '/webhook-draft-project_internal',
      BUBBLE_WORKFLOW_ENVIRONMENTS.development,
    ),
    'https://admin-83903.bubbleapps.io/version-83k77/api/1.1/wf/webhook-draft-project_internal',
  )
})
