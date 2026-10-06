import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSubmissionPayload } from '../src/lib/api.js'

test('sends news consent as a Bubble-compatible Yes/No boolean', () => {
  const optedIn = buildSubmissionPayload('client@example.com', {}, { receiveNews: true })
  const optedOut = buildSubmissionPayload('client@example.com', {}, { receiveNews: false })
  const omitted = buildSubmissionPayload('client@example.com', {})

  assert.equal(optedIn.receiveNews, true)
  assert.equal(optedOut.receiveNews, false)
  assert.equal(omitted.receiveNews, false)
  assert.equal(typeof optedIn.receiveNews, 'boolean')
})

test('sends the existing Bubble project and conversation references', () => {
  const payload = buildSubmissionPayload('', {}, {
    userId: 'user-123',
    projectId: 'project-456',
    conversationId: 'conversation-789',
  })
  assert.equal(payload.u, 'user-123')
  assert.equal(payload.p, 'project-456')
  assert.equal(payload.conversation_id, 'conversation-789')
  assert.equal(Object.hasOwn(payload, 'email'), false)
})
