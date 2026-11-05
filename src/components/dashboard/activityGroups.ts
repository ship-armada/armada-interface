// ABOUTME: groupActivityByDate — sections the All activity list: Pending first, then Today, Yesterday, and one group per
// ABOUTME: month ("November"; "December 2025" for an earlier year). Local calendar days; each group keeps the list's order.

import type { DashboardActivityItem } from './txActivityAdapter'

export interface ActivityGroup {
  /** Section heading: "Pending", "Today", "Yesterday", "November", "December 2025". */
  label: string
  items: DashboardActivityItem[]
}

/** Midnight (local) of the day containing `ms`. */
function startOfDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dateLabel(occurredAt: number, now: number): string {
  const today = startOfDay(now)
  const day = startOfDay(occurredAt)
  if (day >= today) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day >= yesterday.getTime()) return 'Yesterday'
  const date = new Date(occurredAt)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleString('en-US', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' })
}

/**
 * Group a newest-first activity list into dated sections. A pending tx goes under "Pending" whatever its date, so what's
 * still in flight stays at the top. Empty groups are left out.
 */
export function groupActivityByDate(items: readonly DashboardActivityItem[], now: number): ActivityGroup[] {
  const groups: ActivityGroup[] = []
  const byLabel = new Map<string, ActivityGroup>()
  const pending = items.filter((item) => item.pending)
  if (pending.length > 0) groups.push({ label: 'Pending', items: pending })
  for (const item of items) {
    if (item.pending) continue
    const label = dateLabel(item.occurredAt, now)
    let group = byLabel.get(label)
    if (!group) {
      group = { label, items: [] }
      byLabel.set(label, group)
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}
