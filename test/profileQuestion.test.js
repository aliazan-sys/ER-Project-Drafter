import test from 'node:test'
import assert from 'node:assert/strict'
import { enforceProfileQuestion } from '../shared/gemini.js'

const ready = { reply: 'Drafting your project request now.', readyToDraft: true, suggestions: [] }
const user = (text) => ({ role: 'user', text })
const bot = (text) => ({ role: 'bot', text })
const ASK = 'Are you submitting as an individual or on behalf of an organisation?'

test('leaves replies alone while the model is still asking questions', () => {
  const asking = { reply: 'What is your budget?', readyToDraft: false, suggestions: [] }
  assert.equal(enforceProfileQuestion([user('hi')], asking), asking)
})

test('asks the Individual/Organisation question if the model tries to draft without it', () => {
  const out = enforceProfileQuestion([user('A website for my shop'), bot('Budget?'), user('$2k')], ready)
  assert.equal(out.readyToDraft, false)
  assert.equal(out.reply, ASK)
  assert.deepEqual(out.suggestions, ['Individual', 'Organisation'])
})

test('asks the question if it was asked but not yet answered', () => {
  const out = enforceProfileQuestion([user('x'), bot(ASK)], ready)
  assert.equal(out.readyToDraft, false)
  assert.equal(out.reply, ASK)
})

test('asks the single follow-up after the type answer', () => {
  const ind = enforceProfileQuestion([user('x'), bot(ASK), user('Individual')], ready)
  assert.equal(ind.readyToDraft, false)
  assert.equal(ind.reply, 'Where are you based?')
  const org = enforceProfileQuestion([user('x'), bot(ASK), user('Organisation')], ready)
  assert.equal(org.readyToDraft, false)
  assert.match(org.reply, /organisation’s name/)
})

test('allows drafting once the branch is complete, or for existing Bubble users', () => {
  const done = [user('x'), bot(ASK), user('Individual'), bot('Where are you based?'), user('London')]
  assert.equal(enforceProfileQuestion(done, ready), ready)
  assert.equal(enforceProfileQuestion([user('x')], ready, { skipOrgProfile: true }), ready)
})

test('does not loop: type volunteered up front and location already answered', () => {
  const messages = [
    user('Create a project. I’m submitting as an individual, delivered remotely.'),
    bot('Where are you based?'),
    user('Islamabad'),
  ]
  assert.equal(enforceProfileQuestion(messages, ready), ready)
})

test('never repeats a question it already forced', () => {
  const forced = [user('A website for my shop'), bot(ASK), user('Individual'), bot('Where are you based?'), user('Islamabad')]
  assert.equal(enforceProfileQuestion(forced, ready), ready)
  const declined = [user('x'), bot(ASK), user('Organisation'), bot('What is your organisation’s name, and where is it based?'), user('Acme')]
  assert.equal(enforceProfileQuestion(declined, ready), ready)
})

test('does not re-ask the profile question once any answer was given to it', () => {
  assert.equal(enforceProfileQuestion([user('x'), bot(ASK), user('hmm not sure')], ready), ready)
})
