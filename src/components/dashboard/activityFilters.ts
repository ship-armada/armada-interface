// ABOUTME: Predicates for filtering dashboard activity items by kind chip and by the search box — a tx hash, a
// ABOUTME: counterparty address, or (while balances are shown) an amount. Adapted from the armada-app mockup's utils.

import type { DashboardActivityItem } from '@/components/dashboard/txActivityAdapter'
import type { ActivityKindFilter } from './RecentActivityList/ActivityKindFilters'

/** True when the item matches the selected kind chip ('all' matches everything). */
export function matchesActivityKindFilter(
  item: DashboardActivityItem,
  filter: ActivityKindFilter,
): boolean {
  return filter === 'all' || item.kind === filter
}

/** A query typed as an amount ("12", "12.5", "$12,50") normalised to "12.50"-style digits, or null if it isn't one. */
function amountQuery(query: string): string | null {
  const normalized = query.replace(/[$\s]/g, '').replace(',', '.')
  return /^\d+(\.\d*)?$/.test(normalized) ? normalized : null
}

/**
 * True when the query is empty, or matches the item. While amounts are searchable (balances shown), a query typed as a
 * number matches the amount by its leading digits ("12" finds 12.50 and 120.00) and nothing else — most hashes contain
 * every digit, so matching those too would bury the amount. Any other query (and a number while balances are hidden,
 * so searching can't reveal an amount) matches part of the tx hash or the counterparty address, ignoring case.
 */
export function matchesActivitySearch(
  item: DashboardActivityItem,
  query: string,
  options: { amounts: boolean },
): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const amount = options.amounts ? amountQuery(trimmed) : null
  if (amount !== null) return Math.abs(item.amount).toFixed(2).startsWith(amount)
  const needle = trimmed.toLowerCase()
  return [item.txHash, item.address].some((field) => field?.toLowerCase().includes(needle) ?? false)
}
