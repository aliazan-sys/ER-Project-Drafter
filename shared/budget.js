const CURRENCY_TOKENS = [
  { currency: 'EUR', pattern: /(?:\bEUR\b|\beuros?\b|€)/i },
  { currency: 'GBP', pattern: /(?:\bGBP\b|\bpounds?\b|£)/i },
  { currency: 'USD', pattern: /(?:\bUSD\b|\bdollars?\b|\$)/i },
]

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g

export function explicitCurrencyFromMessages(messages) {
  if (!Array.isArray(messages)) return ''

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user' || typeof message.text !== 'string') continue

    const currency = CURRENCY_TOKENS.find(({ pattern }) => pattern.test(message.text))?.currency
    if (currency) return currency
  }

  return ''
}

// Budget answers are commonly short messages such as "20 EUR". Only treat a
// message as an exact supplied budget when it contains one number and one
// supported currency, so ranges and unrelated numeric details remain with the
// model instead of being guessed at here.
export function explicitBudgetFromMessages(messages) {
  if (!Array.isArray(messages)) return null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user' || typeof message.text !== 'string') continue

    const amounts = message.text.match(NUMBER_PATTERN) || []
    if (amounts.length !== 1) continue

    const currency = CURRENCY_TOKENS.find(({ pattern }) => pattern.test(message.text))?.currency
    if (!currency) continue

    const amount = Number(amounts[0].replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount < 0) continue

    return { amount, currency }
  }

  return null
}

// Use a proportional range rather than a fixed amount: about five percent on
// either side, with a three-unit floor so very small budgets still have a
// useful but narrow range. One significant figure keeps the spread readable.
export function proportionalBudgetRange(amount) {
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount < 0) return null

  const spread = Math.max(3, Number((numericAmount * 0.05).toPrecision(1)))
  return {
    from: Math.max(0, numericAmount - spread),
    to: numericAmount + spread,
  }
}
