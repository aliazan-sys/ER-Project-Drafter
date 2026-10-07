import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationIdFromParams } from '../src/lib/platformEmbed.js'

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
