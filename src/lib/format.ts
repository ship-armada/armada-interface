// ABOUTME: Address + USDC formatters. Duplicated from @armada/crowdfund-shared/lib/format.ts.
// ABOUTME: Extract to @armada/eth-utils when both apps need to evolve these helpers.

/** Format a USDC raw amount (6 decimals) as a dollar string, e.g. "$1,200,000". */
export function formatUsdc(amount: bigint): string {
  const dollars = Number(amount) / 1e6
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

/** Format USDC raw amount as a plain number string (for input fields). */
export function formatUsdcPlain(amount: bigint): string {
  return (Number(amount) / 1e6).toString()
}

/** Parse a USDC input string (e.g. "150" or "150.50") to 6-decimal raw bigint. */
export function parseUsdcInput(input: string): bigint {
  const num = parseFloat(input)
  if (Number.isNaN(num) || num < 0) return 0n
  return BigInt(Math.floor(num * 1e6))
}

/** Truncate an Ethereum address to "0x1234...abcd" (mockup convention: 6 chars before, 4 after). */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Compact relative-time formatter — "just now" / "12s ago" / "5m ago" / "3h ago" / "Yesterday" / "Mar 14".
 *
 * Pure / no React. `now` is injectable for deterministic tests; defaults to Date.now().
 * Future tense is supported (negative diffs) → "in 2m", "in 1h".
 */
export function formatRelativeTime(ms: number, now: number = Date.now()): string {
  const diffMs = now - ms
  const future = diffMs < 0
  const abs = Math.abs(diffMs)
  const s = Math.round(abs / 1000)

  if (s < 10) return future ? 'in a moment' : 'just now'
  if (s < 60) return future ? `in ${s}s` : `${s}s ago`

  const m = Math.round(s / 60)
  if (m < 60) return future ? `in ${m}m` : `${m}m ago`

  const h = Math.round(m / 60)
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`

  const d = Math.round(h / 24)
  if (d === 1) return future ? 'Tomorrow' : 'Yesterday'
  if (d < 7) return future ? `in ${d}d` : `${d}d ago`

  // Fall back to absolute formatting for older timestamps. "Mar 14" / "Mar 14, 2024" (if not this year).
  const date = new Date(ms)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
