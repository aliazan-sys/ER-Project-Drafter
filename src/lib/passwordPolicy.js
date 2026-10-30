export const MIN_PASSWORD = 8

// Same rules as the Bubble signup page, in the order they are displayed.
export const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= MIN_PASSWORD },
  { key: 'uppercase', label: 'one uppercase letter', test: (pw) => pw !== pw.toLowerCase() },
  { key: 'number', label: 'one number', test: (pw) => /[0-9]/.test(pw) },
  { key: 'special', label: 'one special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

export function checkPassword(password) {
  const value = String(password ?? '')
  return PASSWORD_RULES.map((rule) => ({ key: rule.key, label: rule.label, met: rule.test(value) }))
}

export function isPasswordValid(password) {
  return checkPassword(password).every((rule) => rule.met)
}
