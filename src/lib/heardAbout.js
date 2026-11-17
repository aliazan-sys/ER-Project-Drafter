// "How did you hear about EqualReach?" options (the question is optional). Mirrors the Bubble option set
// used by the web app's own signup form: `display` is what the user sees,
// `value` is the option's "parsed text" and is what is sent as heardAboutUs;
// options with `openText` also ask for a short
// free-text detail, labelled with `detailPlaceholder` (sent as heardAboutUsDetail).
export const HEARD_ABOUT_OPTIONS = [
  { display: 'Google or online search', value: 'google', openText: false },
  { display: 'AI recommendation', value: 'ai', openText: false },
  { display: 'Referred by a friend or colleague', value: 'referral', openText: false },
  { display: 'Article, podcast, or media feature', value: 'article', openText: false },
  { display: 'Social media', value: 'social_media', openText: true, detailPlaceholder: '(which platform?)' },
  { display: 'EqualReach team', value: 'er_team', openText: true, detailPlaceholder: '(who?)' },
  { display: 'Partner organization', value: 'partner_organization', openText: true, detailPlaceholder: '(which one?)' },
  { display: 'Event or conference', value: 'event', openText: true, detailPlaceholder: '(which one?)' },
  { display: 'Other', value: 'other', openText: true, detailPlaceholder: 'Enter "other" source' },
]

// Looks an option up by its parsed `value` (what the <select> holds).
export function findHeardAboutOption(value) {
  return HEARD_ABOUT_OPTIONS.find((o) => o.value === value) || null
}
