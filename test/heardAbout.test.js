import test from 'node:test'
import assert from 'node:assert/strict'
import { HEARD_ABOUT_OPTIONS, findHeardAboutOption } from '../src/lib/heardAbout.js'

test('offers the same nine options as the web app signup', () => {
  assert.equal(HEARD_ABOUT_OPTIONS.length, 9)
  assert.equal(HEARD_ABOUT_OPTIONS[0].display, 'Google or online search')
  assert.equal(HEARD_ABOUT_OPTIONS.at(-1).display, 'Other')
})

test('only the open-text options ask for detail', () => {
  assert.equal(findHeardAboutOption('Social media').openText, true)
  assert.equal(findHeardAboutOption('Google or online search').openText, false)
  assert.equal(findHeardAboutOption(''), null)
})
