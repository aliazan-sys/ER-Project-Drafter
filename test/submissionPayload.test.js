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

test('sends the client account type', () => {
  const build = (orgProfile) => buildSubmissionPayload('a@b.co', { orgProfile }, {}).clientType
  assert.equal(build({ submittingAs: 'Individual', type: 'Solo Business' }), 'individual')
  assert.equal(build({ submittingAs: 'Organisation', name: 'Acme', type: '' }), 'organization')
  assert.equal(build({ type: 'Startup' }), 'organization')
  assert.equal(build({ type: 'Solo Business' }), 'individual')
  assert.equal(build({}), '')
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
test('sends how the user heard about EqualReach, only when answered', () => {
  const answered = buildSubmissionPayload('a@b.co', {}, {
    heardAboutUs: 'Social media',
    heardAboutUsDetail: 'LinkedIn',
  })
  assert.equal(answered.heardAboutUs, 'Social media')
  assert.equal(answered.heardAboutUsDetail, 'LinkedIn')

  const noDetail = buildSubmissionPayload('a@b.co', {}, { heardAboutUs: 'AI recommendation' })
  assert.equal(noDetail.heardAboutUs, 'AI recommendation')
  assert.equal(noDetail.heardAboutUsDetail, '')

  const existingUser = buildSubmissionPayload('', {}, { userId: 'u1' })
  assert.equal(Object.hasOwn(existingUser, 'heardAboutUs'), false)
  assert.equal(Object.hasOwn(existingUser, 'heardAboutUsDetail'), false)
})
