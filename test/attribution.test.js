import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attributionFromPage,
  formatAttributionLabel,
  normalizeAttribution,
} from '../shared/attribution.js'

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

test('treats EqualReach parent and subdomain referrers as internal traffic', () => {
  const direct = attributionFromPage(
    'https://er-project-drafter.vercel.app/?embed=draft',
    'https://webflow.equalreach.io/ai-drafter',
  )
  const forwarded = attributionFromPage(
    'https://er-project-drafter.vercel.app/?embed=draft&er_source=equalreach.io',
  )

  assert.equal(direct.acquisitionSource, 'direct')
  assert.equal(direct.referrerHost, null)
  assert.equal(forwarded.acquisitionSource, 'direct')
})

test('recognizes Gmail when Google Mail supplies the referrer', () => {
  const result = attributionFromPage(
    'https://er-project-drafter.vercel.app/?embed=draft',
    'https://mail.google.com/mail/u/0/#inbox/message',
  )

  assert.equal(result.acquisitionSource, 'gmail')
  assert.equal(result.referrerHost, 'mail.google.com')
  assert.equal(formatAttributionLabel(result), 'Source: Gmail')
})

test('uses tagged Gmail campaign data even when the immediate parent is EqualReach', () => {
  const result = attributionFromPage(
    'https://er-project-drafter.vercel.app/?embed=draft&utm_source=gmail&utm_medium=email&utm_campaign=client-outreach',
    'https://equalreach.io/ai-drafter',
  )

  assert.equal(result.acquisitionSource, 'gmail')
  assert.equal(result.utmSource, 'gmail')
  assert.equal(result.utmMedium, 'email')
  assert.equal(result.utmCampaign, 'client-outreach')
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

test('formats the tracked source for Admin Conversations', () => {
  assert.equal(
    formatAttributionLabel({
      acquisition_source: 'linkedin',
      utm_medium: 'paid',
      utm_campaign: 'fall-launch',
    }),
    'Source: linkedin · paid · fall-launch',
  )
  assert.equal(formatAttributionLabel({ acquisition_source: 'direct' }), 'Source: Direct')
  assert.equal(formatAttributionLabel({ acquisition_source: 'equalreach.io' }), 'Source: Direct')
  assert.equal(formatAttributionLabel({ acquisition_source: 'mail.google.com' }), 'Source: Gmail')
  assert.equal(formatAttributionLabel({}), '')
})
