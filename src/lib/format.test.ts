// ABOUTME: Unit tests for lib/format — covers USDC formatting, address truncation, and relative-time bucketing.
// ABOUTME: Relative-time tests inject `now` so the buckets are deterministic across runs.

import { describe, it, expect } from 'vitest'
import { formatUsdc, formatUsdcPlain, parseUsdcInput, truncateAddress, formatRelativeTime } from './format'

describe('formatUsdc', () => {
  it('formats a raw 6-decimal amount as a dollar string', () => {
    expect(formatUsdc(1_500_000n)).toBe('$1.5')
    expect(formatUsdc(1_000_000_000_000n)).toBe('$1,000,000')
  })
})

describe('formatUsdcPlain', () => {
  it('returns a plain decimal string suitable for inputs', () => {
    expect(formatUsdcPlain(2_500_000n)).toBe('2.5')
    expect(formatUsdcPlain(0n)).toBe('0')
  })
})

describe('parseUsdcInput', () => {
  it('parses a decimal string to raw 6-decimal bigint', () => {
    expect(parseUsdcInput('1')).toBe(1_000_000n)
    expect(parseUsdcInput('0.5')).toBe(500_000n)
  })
  it('returns 0 for invalid or negative input', () => {
    expect(parseUsdcInput('abc')).toBe(0n)
    expect(parseUsdcInput('-5')).toBe(0n)
  })
})

describe('truncateAddress', () => {
  it('truncates a long address to 6+4 chars', () => {
    expect(truncateAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234...5678')
  })
  it('returns short strings unchanged', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-05-19T12:00:00Z').getTime()

  it('returns "just now" for recent timestamps', () => {
    expect(formatRelativeTime(now - 1000, now)).toBe('just now')
  })

  it('formats seconds ago', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('30s ago')
  })

  it('formats minutes ago', () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago')
  })

  it('formats hours ago', () => {
    expect(formatRelativeTime(now - 3 * 3600_000, now)).toBe('3h ago')
  })

  it('says "Yesterday" for ~1 day ago', () => {
    expect(formatRelativeTime(now - 24 * 3600_000, now)).toBe('Yesterday')
  })

  it('formats days ago up to a week', () => {
    expect(formatRelativeTime(now - 3 * 24 * 3600_000, now)).toBe('3d ago')
  })

  it('falls back to absolute date for older timestamps', () => {
    const older = new Date('2026-03-14T12:00:00Z').getTime()
    expect(formatRelativeTime(older, now)).toMatch(/Mar 14/)
  })

  it('handles future timestamps', () => {
    expect(formatRelativeTime(now + 30_000, now)).toBe('in 30s')
    expect(formatRelativeTime(now + 24 * 3600_000, now)).toBe('Tomorrow')
  })
})
