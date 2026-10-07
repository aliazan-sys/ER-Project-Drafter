import test from 'node:test'
import assert from 'node:assert/strict'
import {
  conversationIdFromParams,
  suggestionsFromMessages,
} from '../src/lib/platformEmbed.js'

test('reads the canonical conversation URL parameter', () => {
  assert.equal(
    conversationIdFromParams(new URLSearchParams('conversation=canonical-id')),
    'canonical-id',
  )
})

test('accepts conversation_id from Bubble URLs', () => {
  assert.equal(
    conversationIdFromParams(new URLSearchParams('conversation_id=bubble-id')),
    'bubble-id',
  )
})

test('prefers conversation and falls back to conversation_id when blank', () => {
  assert.equal(
    conversationIdFromParams(new URLSearchParams('conversation=first&conversation_id=second')),
    'first',
  )
  assert.equal(
    conversationIdFromParams(new URLSearchParams('conversation=%20&conversation_id=second')),
    'second',
  )
})

test('restores quick-reply suggestions from the latest assistant message', () => {
  assert.deepEqual(
    suggestionsFromMessages([
      { role: 'bot', text: 'Earlier question', suggestions: ['Earlier'] },
      { role: 'user', text: 'My answer' },
      {
        role: 'bot',
        text: 'Follow-up question',
        suggestions: [' Option A ', 'Option B', 'Option A', null, 'Option C', 'Option D', 'Option E'],
      },
    ]),
    ['Option A', 'Option B', 'Option C', 'Option D'],
  )
})

test('returns no suggestions for legacy messages without saved quick replies', () => {
  assert.deepEqual(suggestionsFromMessages([{ role: 'bot', text: 'Legacy reply' }]), [])
})
