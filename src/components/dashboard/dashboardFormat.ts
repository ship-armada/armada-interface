// ABOUTME: Formatting helpers for dashboard USDC amounts, address truncation, and activity times (relative, then a date).
// ABOUTME: Ported from the armada-app design mockup (utils/format.ts + utils/formatTimeAgo.ts).
export function formatUsdcAmount(value: number, fractionDigits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })
}

/** Shielded / Armada zk address — slightly longer tail for readability. */
export function truncateArmadaAddress(address: string): string {
  if (address.length <= 15) return address
  return `${address.slice(0, 6)}...${address.slice(-6)}`
}

/** Activity-row time: "Just now" / "N min ago" / "N hours ago" / "N days ago" for the first week, then "Oct 3" (+ year). */
export function formatTimeAgo(timestamp: number, now = Date.now()): string {
  const elapsedMs = Math.max(0, now - timestamp)
  const seconds = Math.floor(elapsedMs / 1000)

  if (seconds < 60) return 'Just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 min ago' : `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`

  // Past a week, an absolute date reads better than "N weeks ago" (which otherwise grows forever): "Oct 3",
  // with the year when it isn't this year ("Nov 4, 2025").
  const date = new Date(timestamp)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-US', sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
}
