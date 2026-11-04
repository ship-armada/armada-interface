// ABOUTME: Tests for dashboardFormat.formatTimeAgo — relative labels for the first week, then an absolute date
// ABOUTME: ("Oct 3", with the year when it isn't this year) instead of "N weeks ago" forever.

import { describe, it, expect } from 'vitest'
import { formatTimeAgo } from './dashboardFormat'

// Local-time construction so the absolute-date assertions don't depend on the test runner's timezone.
const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime() // Nov 4, 2026 12:00 local
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatTimeAgo', () => {
  it('reads relative for the first week', () => {
    expect(formatTimeAgo(NOW - 10_000, NOW)).toBe('Just now')
    expect(formatTimeAgo(NOW - 5 * MIN, NOW)).toBe('5 min ago')
    expect(formatTimeAgo(NOW - 3 * HOUR, NOW)).toBe('3 hours ago')
    expect(formatTimeAgo(NOW - 6 * DAY, NOW)).toBe('6 days ago')
  })

  it('switches to an absolute date after 7 days (8B: no more "52 weeks ago")', () => {
    expect(formatTimeAgo(new Date(2026, 9, 3, 9, 0).getTime(), NOW)).toBe('Oct 3')
  })

  it('adds the year for a date in another year', () => {
    expect(formatTimeAgo(new Date(2025, 10, 4, 9, 0).getTime(), NOW)).toBe('Nov 4, 2025')
  })
})
