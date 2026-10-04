import test from 'node:test'
import assert from 'node:assert/strict'
import { attributionFromPage, normalizeAttribution } from '../shared/attribution.js'

test('uses attribution forwarded by the Webflow host', () => {
  const result = attributionFromPage(
    'https://er-project-drafter.vercel.app/?embed=draft&utm_source=linkedin&utm_medium=paid&utm_campaign=fall&utm_content=video&gclid=g-123&er_source=linkedin&er_referrer_host=linkedin.com&er_landing_path=%2Fai-drafter',
    'https://www.equalreach.io/ai-drafter',
  )

  assert.deepEqual(result, {
    acquisitionSource: 'linkedin',
    utmSource: 'linkedin',
    utmMedium: 'paid',
    utmCampaign: 'fall',
    utmTerm: null,
    utmContent: 'video',
    referrerHost: 'linkedin.com',
    landingPath: '/ai-drafter',
    gclid: 'g-123',
    fbclid: null,
    msclkid: null,
  })
})

test('derives a referring domain without storing the full referrer URL', () => {
  const result = attributionFromPage(
    'https://er-project-drafter.vercel.app/',
    'https://www.google.com/search?q=sensitive+query',
  )

  assert.equal(result.acquisitionSource, 'google.com')
  assert.equal(result.referrerHost, 'google.com')
  assert.equal(result.landingPath, '/')
  assert.equal(JSON.stringify(result).includes('sensitive'), false)
})

test('marks visits without UTM or referrer data as direct', () => {
  const result = attributionFromPage('https://er-project-drafter.vercel.app/?embed=draft')
  assert.equal(result.acquisitionSource, 'direct')
})

test('does not mistake the Webflow parent for the referrer of a direct visit', () => {
  const result = attributionFromPage(
    'https://er-project-drafter.vercel.app/?embed=draft&er_source=direct&er_landing_path=%2Fai-drafter',
    'https://www.equalreach.io/ai-drafter',
  )

  assert.equal(result.acquisitionSource, 'direct')
  assert.equal(result.referrerHost, null)
})

test('normalizes snake-case server input and caps untrusted values', () => {
  const result = normalizeAttribution({
    acquisition_source: '  newsletter  ',
    utm_campaign: 'x'.repeat(400),
  })

  assert.equal(result.acquisitionSource, 'newsletter')
  assert.equal(result.utmCampaign.length, 255)
})
