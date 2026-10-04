import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../webflow-drafter-embed.html', import.meta.url), 'utf8')
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]

test('Webflow drafter embed contains valid JavaScript', () => {
  assert.ok(script)
  assert.doesNotThrow(() => new Function(script))
})

test('Webflow drafter embed forwards the acquisition contract', () => {
  for (const field of [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'msclkid',
    'er_source',
    'er_referrer_host',
    'er_landing_path',
  ]) {
    assert.match(script, new RegExp(field))
  }
  assert.match(script, /sessionStorage\.setItem\(ATTRIBUTION_KEY/)
})
