// "How did you hear about EqualReach?" options (the question is optional). Mirrors the Bubble option set
// used by the web app's own signup form: `display` is what the user sees (and
// what is sent as heardAboutUs); options with `openText` also ask for a short
// free-text detail, labelled with `detailPlaceholder` (sent as heardAboutUsDetail).
export const HEARD_ABOUT_OPTIONS = [
  { display: 'Google or online search', openText: false },
  { display: 'AI recommendation', openText: false },
  { display: 'Referred by a friend or colleague', openText: false },
  { display: 'Article, podcast, or media feature', openText: false },
  { display: 'Social media', openText: true, detailPlaceholder: '(which platform?)' },
  { display: 'EqualReach team', openText: true, detailPlaceholder: '(who?)' },
  { display: 'Partner organization', openText: true, detailPlaceholder: '(which one?)' },
  { display: 'Event or conference', openText: true, detailPlaceholder: '(which one?)' },
  { display: 'Other', openText: true, detailPlaceholder: 'Enter "other" source' },
]

export function findHeardAboutOption(display) {
  return HEARD_ABOUT_OPTIONS.find((o) => o.display === display) || null
}
