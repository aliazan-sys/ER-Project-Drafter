import test from 'node:test'
import assert from 'node:assert/strict'
import { checkPassword, isPasswordValid } from '../src/lib/passwordPolicy.js'

test('accepts a password meeting every rule', () => {
  assert.equal(isPasswordValid('Abcdef1!'), true)
})

test('rejects passwords missing a single rule', () => {
  assert.equal(isPasswordValid('Abcde1!'), false) // too short
  assert.equal(isPasswordValid('abcdefg1!'), false) // no uppercase
  assert.equal(isPasswordValid('Abcdefgh!'), false) // no number
  assert.equal(isPasswordValid('Abcdefg12'), false) // no special character
})

test('treats a space as a special character and keeps spaces unstripped', () => {
  assert.equal(isPasswordValid('Abcdefg1 '), true)
})

test('reports each rule separately, in display order', () => {
  assert.deepEqual(
    checkPassword('abc').map((r) => [r.key, r.met]),
    [['length', false], ['uppercase', false], ['number', false], ['special', false]],
  )
  assert.equal(isPasswordValid(undefined), false)
})
