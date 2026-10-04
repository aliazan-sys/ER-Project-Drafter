import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const files = ['webflow-drafter-embed.html', 'webflow-drafter-embed.min.html']
const scripts = files.map((file) => ({
  file,
  script: readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').match(
    /<script>([\s\S]*?)<\/script>/,
  )?.[1],
}))

test('Webflow drafter embed contains valid JavaScript', () => {
  for (const { file, script } of scripts) {
    assert.ok(script, `${file} should contain a script`)
    assert.doesNotThrow(() => new Function(script), `${file} should compile`)
  }
})

test('Webflow drafter embed forwards the acquisition contract', () => {
  for (const { file, script } of scripts) {
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
      assert.match(script, new RegExp(field), `${file} should forward ${field}`)
    }
    assert.match(script, /sessionStorage\.setItem\(/)
  }
})
