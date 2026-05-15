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
