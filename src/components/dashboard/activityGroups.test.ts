// ABOUTME: Tests for groupActivityByDate — the All activity panel's sections: Pending first, then Today, Yesterday,
// ABOUTME: and one per month (with the year once it isn't this year), keeping each group's newest-first order.

import { describe, it, expect } from 'vitest'
import { groupActivityByDate } from './activityGroups'
import type { DashboardActivityItem } from './txActivityAdapter'

// Local-time instants so the day boundaries match the user's calendar.
const NOW = new Date(2026, 10, 5, 15, 0).getTime() // 5 Nov 2026, 15:00

function item(id: string, occurredAt: number, status: DashboardActivityItem['status'] = 'settled'): DashboardActivityItem {
  return { id, kind: 'send', label: id, amount: -1, occurredAt, status, pending: status === 'pending' }
}

describe('groupActivityByDate', () => {
  it('sections a newest-first list: Pending, Today, Yesterday, then by month — the year only for earlier years', () => {
    const items = [
      item('pending', new Date(2026, 10, 5, 14, 0).getTime(), 'pending'),
      item('today', new Date(2026, 10, 5, 0, 1).getTime()),
      item('yesterday', new Date(2026, 10, 4, 23, 59).getTime()),
      item('nov', new Date(2026, 10, 1, 9, 0).getTime()),
      item('oct', new Date(2026, 9, 31, 9, 0).getTime()),
      item('oct2', new Date(2026, 9, 2, 9, 0).getTime()),
      item('last-year', new Date(2025, 11, 20, 9, 0).getTime()),
    ]
    expect(groupActivityByDate(items, NOW).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Pending', ['pending']],
      ['Today', ['today']],
      ['Yesterday', ['yesterday']],
      ['November', ['nov']],
      ['October', ['oct', 'oct2']],
      ['December 2025', ['last-year']],
    ])
  })

  it('a pending tx sits under Pending whatever its date; empty groups are left out', () => {
    const groups = groupActivityByDate([item('old-pending', new Date(2026, 8, 1).getTime(), 'pending')], NOW)
    expect(groups.map((g) => g.label)).toEqual(['Pending'])
  })

  it('Yesterday is the previous calendar day across a month boundary', () => {
    const firstOfMonth = new Date(2026, 10, 1, 10, 0).getTime()
    const groups = groupActivityByDate([item('oct31', new Date(2026, 9, 31, 22, 0).getTime())], firstOfMonth)
    expect(groups.map((g) => g.label)).toEqual(['Yesterday'])
  })
})
