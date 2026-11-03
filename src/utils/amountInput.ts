// ABOUTME: Amount-field string helpers for DepositAmountCard + the request screen — keystroke/paste sanitiser (digits + one
// ABOUTME: dot, ≤ 6 decimals, a typed comma read as the decimal point), en-US display grouping, and the active-amount check.

/** Sanitize free-form decimal entry (digits + single dot), capped at USDC's 6 decimal places. */
export function sanitizeAmountInput(raw: string): string {
  const normalized = raw.replace(/,/g, '')
  let out = ''
  let seenDecimal = false
  let fractionDigits = 0
  for (const char of normalized) {
    if (char >= '0' && char <= '9') {
      // Cap the fractional portion at USDC's 6 decimals — drop a 7th digit rather than let it
      // fall through to parseUsdcInput's `too-many-decimals` error (which reads the amount as 0).
      if (seenDecimal) {
        if (fractionDigits >= 6) continue
        fractionDigits += 1
      }
      out += char
      continue
    }
    if (char === '.' && !seenDecimal) {
      seenDecimal = true
      out += char
    }
  }
  // Drop redundant leading zeros in the integer part ("05" → "5") while preserving a lone "0" and
  // the "0." a user needs to type a sub-one amount forward.
  return out.replace(/^0+(?=\d)/, '')
}

/** If `raw` is `previous` with exactly one character inserted (a single keystroke), its index; else -1. */
function insertedCharIndex(raw: string, previous: string): number {
  if (raw.length !== previous.length + 1) return -1
  for (let i = 0; i < raw.length; i++) {
    if (raw.slice(0, i) + raw.slice(i + 1) === previous) return i
  }
  return -1
}

/**
 * Turn a comma the user meant as a decimal point into "." before sanitising; leave grouping commas alone
 * (the sanitiser strips them). Comma-decimal locales type "1,5" for 1.5, which a strip-all-commas
 * sanitiser would read as 15.
 *
 * - A single keystroke (compared with the field's previous display) that types "," is always a decimal
 *   point. Comparing with the previous display keeps the grouping commas our own display inserts
 *   ("1,500") as grouping while the user types digits.
 * - Pasted / multi-character input: with both "," and ".", the last one is the decimal point
 *   ("1.500,25" → 1500.25). With only commas, a single comma NOT followed by exactly three digits is a
 *   decimal ("1,5", "0,25"); otherwise the commas are grouping ("1,500", "1,000,000").
 */
function normalizeDecimalComma(raw: string, previousDisplay: string): string {
  const typed = insertedCharIndex(raw, previousDisplay)
  if (typed !== -1) {
    return raw[typed] === ',' ? `${raw.slice(0, typed)}.${raw.slice(typed + 1)}` : raw
  }
  const lastComma = raw.lastIndexOf(',')
  if (lastComma === -1) return raw
  const lastDot = raw.lastIndexOf('.')
  if (lastDot !== -1) {
    if (lastComma < lastDot) return raw
    return `${raw.slice(0, lastComma).replace(/[.,]/g, '')}.${raw.slice(lastComma + 1)}`
  }
  const commaCount = raw.split(',').length - 1
  const digitsAfter = raw.slice(lastComma + 1).replace(/\D/g, '').length
  if (commaCount === 1 && digitsAfter !== 3) return `${raw.slice(0, lastComma)}.${raw.slice(lastComma + 1)}`
  return raw
}

/**
 * Sanitise an amount-field edit: `raw` is the field's new text, `previousDisplay` the text it showed
 * before the edit (what `formatAmountInputDisplay` rendered). Reads a typed / pasted comma as the
 * decimal point where that's the user's intent, then applies `sanitizeAmountInput`.
 */
export function sanitizeAmountEdit(raw: string, previousDisplay: string): string {
  return sanitizeAmountInput(normalizeDecimalComma(raw, previousDisplay))
}

/**
 * Format a sanitized amount for display with en-US thousand grouping (1,000 / 1,000,000). The
 * decimal suffix is preserved verbatim (so mid-entry "1,000." keeps its trailing dot), and a bare
 * fraction gains a leading zero for display (".5" → "0.5"). The stored value stays ungrouped —
 * `sanitizeAmountInput` strips the commas back out on the next keystroke.
 */
export function formatAmountInputDisplay(sanitized: string): string {
  if (!sanitized) return ''
  const decimalIndex = sanitized.indexOf('.')
  const intPart = decimalIndex === -1 ? sanitized : sanitized.slice(0, decimalIndex)
  const decSuffix = decimalIndex === -1 ? '' : sanitized.slice(decimalIndex)
  if (!intPart) {
    return decSuffix ? `0${decSuffix}` : ''
  }
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${formattedInt}${decSuffix}`
}

/** True when the user has a non-zero amount or is mid-decimal entry (e.g. "0."). */
export function hasActiveAmount(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.') return false
  if (trimmed.endsWith('.')) return true
  const num = parseFloat(trimmed)
  return !Number.isNaN(num) && num !== 0
}
