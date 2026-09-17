// ABOUTME: Unit tests for redeemedGrossFromLogs — parses the redeemed gross from a redeemAndShield
// ABOUTME: receipt's USDC transfers into the pool, with the plausibility guard against mis-parse.

import { describe, it, expect } from 'vitest'
import { redeemedGrossFromLogs, ERC20_TRANSFER_TOPIC, type TransferLog } from './redeemedGross'

const USDC = '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238'
const POOL = '0x5f3324b47b3cff937bb67c30b362898e193e5216'
const OTHER = '0x00000000000000000000000000000000000000ab'

const word = (hex: string) => `0x${hex.replace(/^0x/, '').padStart(64, '0')}`

function transferLog(token: string, to: string, value: bigint): TransferLog {
  return {
    address: token,
    topics: [ERC20_TRANSFER_TOPIC, word('0x00'), word(to), ],
    data: word(value.toString(16)),
  }
}

const FEE = 5_482_931n
const ESTIMATE = 6_000_000n // typed 6 USDC

describe('redeemedGrossFromLogs', () => {
  it('returns the USDC transferred into the pool as the redeemed gross', () => {
    // The real case: shares redeemed to 6.000008 gross re-shielded into the pool.
    const logs = [
      transferLog(USDC, OTHER, 999_999n), // adapter/vault intermediate — not to the pool
      transferLog(USDC, POOL, 6_000_008n),
    ]
    expect(redeemedGrossFromLogs({ logs, usdcAddress: USDC, poolAddress: POOL, fee: FEE, estimate: ESTIMATE }))
      .toBe(6_000_008n)
  })

  it('ignores non-USDC tokens and transfers to non-pool addresses', () => {
    const logs = [
      transferLog('0x000000000000000000000000000000000000dead', POOL, 6_000_000n), // wrong token
      transferLog(USDC, OTHER, 6_000_000n), // right token, wrong recipient
    ]
    expect(redeemedGrossFromLogs({ logs, usdcAddress: USDC, poolAddress: POOL, fee: FEE, estimate: ESTIMATE }))
      .toBeUndefined()
  })

  it('rejects a gross that does not cover the fee (received would be negative)', () => {
    const logs = [transferLog(USDC, POOL, FEE - 1n)]
    // Also out of band, but the fee floor alone must reject it.
    expect(redeemedGrossFromLogs({ logs, usdcAddress: USDC, poolAddress: POOL, fee: FEE, estimate: FEE - 1n }))
      .toBeUndefined()
  })

  it('rejects an implausible gross far from the estimate (guards a mis-parse)', () => {
    // A value >25% below the 6.0 estimate — e.g. a shares-count (~5.8) mistaken for USDC would still be
    // in-band, but a genuinely broken parse landing well outside is rejected → keep the estimate.
    const logs = [transferLog(USDC, POOL, 3_000_000n)] // 50% of estimate
    expect(redeemedGrossFromLogs({ logs, usdcAddress: USDC, poolAddress: POOL, fee: FEE, estimate: ESTIMATE }))
      .toBeUndefined()
  })

  it('accepts a gross within the ±25% band (real rate slippage is far smaller)', () => {
    const logs = [transferLog(USDC, POOL, 6_000_008n)]
    expect(redeemedGrossFromLogs({ logs, usdcAddress: USDC, poolAddress: POOL, fee: FEE, estimate: ESTIMATE }))
      .toBe(6_000_008n)
  })

  it('returns undefined when no USDC-to-pool transfer is present (gross 0)', () => {
    expect(redeemedGrossFromLogs({ logs: [], usdcAddress: USDC, poolAddress: POOL, fee: FEE, estimate: ESTIMATE }))
      .toBeUndefined()
  })
})
