// ABOUTME: Tests for the activity filter predicates — the kind chip, and the search box matching a tx hash, a counterparty
// ABOUTME: address, or (only while balances are shown) an amount typed as a number.

import { describe, it, expect } from 'vitest'
import { matchesActivityKindFilter, matchesActivitySearch } from './activityFilters'
import type { DashboardActivityItem } from './txActivityAdapter'

const send: DashboardActivityItem = {
  id: 's',
  kind: 'send',
  label: 'Sent privately',
  amount: -12.5,
  occurredAt: 0,
  txHash: '0xAbC123def',
  address: '0zk1qyfoo9barK9f2',
  status: 'settled',
  pending: false,
}

describe('matchesActivitySearch', () => {
  const shown = { amounts: true }

  it('matches everything for an empty query', () => {
    expect(matchesActivitySearch(send, '  ', shown)).toBe(true)
  })

  it('matches part of the tx hash or the counterparty address, ignoring case', () => {
    expect(matchesActivitySearch(send, 'abc123', shown)).toBe(true)
    expect(matchesActivitySearch(send, 'K9F2', shown)).toBe(true)
    expect(matchesActivitySearch(send, '0xnope', shown)).toBe(false)
  })

  it('matches an amount typed as a number by its leading digits, ignoring sign, "$" and a comma decimal', () => {
    expect(matchesActivitySearch(send, '12', shown)).toBe(true)
    expect(matchesActivitySearch(send, '12.5', shown)).toBe(true)
    expect(matchesActivitySearch(send, '12.50', shown)).toBe(true)
    expect(matchesActivitySearch(send, '12,5', shown)).toBe(true)
    expect(matchesActivitySearch(send, '$12.5', shown)).toBe(true)
    expect(matchesActivitySearch(send, '2.5', shown)).toBe(false)
    expect(matchesActivitySearch(send, '13', shown)).toBe(false)
  })

  it('a number matches amounts only — not digits that happen to appear in a hash or address', () => {
    expect(matchesActivitySearch(send, '123', shown)).toBe(false)
  })

  it('while balances are hidden, a number is matched against the hash and address instead — never the amount', () => {
    const hidden = { amounts: false }
    expect(matchesActivitySearch(send, '12.5', hidden)).toBe(false)
    expect(matchesActivitySearch(send, '123', hidden)).toBe(true)
  })

  it('an item with no hash or address matches no text query', () => {
    const link: DashboardActivityItem = { ...send, txHash: undefined, address: undefined, kind: 'requestLink', amount: 3 }
    expect(matchesActivitySearch(link, '0xabc', shown)).toBe(false)
    expect(matchesActivitySearch(link, '3', shown)).toBe(true)
  })
})

describe('matchesActivityKindFilter', () => {
  it("matches the chosen kind, and everything for 'all'", () => {
    expect(matchesActivityKindFilter(send, 'all')).toBe(true)
    expect(matchesActivityKindFilter(send, 'send')).toBe(true)
    expect(matchesActivityKindFilter(send, 'deposit')).toBe(false)
  })
})
