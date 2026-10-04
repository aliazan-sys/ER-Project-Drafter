import test from 'node:test'
import assert from 'node:assert/strict'

import {
  explicitBudgetFromMessages,
  explicitCurrencyFromMessages,
  proportionalBudgetRange,
} from '../shared/budget.js'

test('extracts the latest exact budget and explicitly supplied currency', () => {
  assert.deepEqual(
    explicitBudgetFromMessages([
      { role: 'user', text: 'I need a landing page' },
      { role: 'assistant', text: 'What is your budget?' },
      { role: 'user', text: 'My budget is 20 EUR' },
    ]),
    { amount: 20, currency: 'EUR' },
  )

  assert.deepEqual(
    explicitBudgetFromMessages([{ role: 'user', text: 'Around $10,000' }]),
    { amount: 10000, currency: 'USD' },
  )
})

test('does not reinterpret an explicitly supplied range as one exact budget', () => {
  assert.equal(
    explicitBudgetFromMessages([{ role: 'user', text: 'Between 20 and 30 EUR' }]),
    null,
  )
})

test('preserves an explicit currency even when the message has other numbers', () => {
  assert.equal(
    explicitCurrencyFromMessages([
      { role: 'user', text: 'My budget is 20 EUR for the first 3 months' },
    ]),
    'EUR',
  )
})

test('uses a narrow minimum spread for a small exact budget', () => {
  assert.deepEqual(proportionalBudgetRange(20), { from: 17, to: 23 })
  assert.deepEqual(proportionalBudgetRange(100), { from: 95, to: 105 })
})

test('uses an approximately five-percent spread for a large budget', () => {
  assert.deepEqual(proportionalBudgetRange(10000), { from: 9500, to: 10500 })
})
