import test from 'node:test'
import assert from 'node:assert/strict'
import { HEARD_ABOUT_OPTIONS, findHeardAboutOption } from '../src/lib/heardAbout.js'

test('offers the same nine options as the web app signup', () => {
  assert.equal(HEARD_ABOUT_OPTIONS.length, 9)
  assert.equal(HEARD_ABOUT_OPTIONS[0].display, 'Google or online search')
  assert.equal(HEARD_ABOUT_OPTIONS.at(-1).display, 'Other')
})

test('sends the Bubble option set parsed text, not the display text', () => {
  assert.deepEqual(
    HEARD_ABOUT_OPTIONS.map((o) => o.value),
    ['google', 'ai', 'referral', 'article', 'social_media', 'er_team', 'partner_organization', 'event', 'other'],
  )
})

test('only the open-text options ask for detail', () => {
  assert.equal(findHeardAboutOption('social_media').openText, true)
  assert.equal(findHeardAboutOption('google').openText, false)
  assert.equal(findHeardAboutOption(''), null)
})
