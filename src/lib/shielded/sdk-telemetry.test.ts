// ABOUTME: Unit tests for the SDK telemetry sink — maps the SDK's sync.quicksync event onto
// ABOUTME: track('sdk.quicksync'), ignores unknown events, and rejects malformed payloads.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const trackMock = vi.fn()
vi.mock('../telemetry', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

import { sdkTelemetrySink } from './sdk-telemetry'

beforeEach(() => trackMock.mockReset())

describe('sdkTelemetrySink', () => {
  it('forwards a served quick-sync outcome onto track(sdk.quicksync) with the mapped shape', () => {
    // WHY: this is the whole point — an operator greps sdk.quicksync to confirm the indexer served a
    // root-verified batch. The sink must preserve the outcome + block context faithfully.
    sdkTelemetrySink.emit('sync.quicksync', { outcome: 'served', fromBlock: 5, head: 9, tailCovered: false })
    expect(trackMock).toHaveBeenCalledWith('sdk.quicksync', {
      outcome: 'served',
      fromBlock: 5,
      head: 9,
      tailCovered: false,
    })
  })

  it('carries tailCovered + root-mismatch-fallback through unchanged', () => {
    sdkTelemetrySink.emit('sync.quicksync', { outcome: 'served', fromBlock: 5, head: 9, tailCovered: true })
    expect(trackMock).toHaveBeenLastCalledWith('sdk.quicksync', expect.objectContaining({ tailCovered: true }))
    sdkTelemetrySink.emit('sync.quicksync', { outcome: 'root-mismatch-fallback', fromBlock: 5, head: 9, tailCovered: false })
    expect(trackMock).toHaveBeenLastCalledWith('sdk.quicksync', expect.objectContaining({ outcome: 'root-mismatch-fallback' }))
  })

  it('forwards the fallback reason + HTTP status when the SDK classifies the discard', () => {
    // WHY: `root-mismatch-fallback` used to conflate ≥4 causes. Forwarding `reason`/`status` is what
    // lets a fallback self-diagnose (e.g. an indexer 502) instead of looking like a real root mismatch.
    sdkTelemetrySink.emit('sync.quicksync', {
      outcome: 'root-mismatch-fallback', fromBlock: 5, head: 9, tailCovered: false,
      reason: 'indexer-http-error', status: 502,
    })
    expect(trackMock).toHaveBeenCalledWith('sdk.quicksync', {
      outcome: 'root-mismatch-fallback',
      fromBlock: 5,
      head: 9,
      tailCovered: false,
      reason: 'indexer-http-error',
      status: 502,
    })
  })

  it('forwards reason without status for a non-HTTP fallback cause', () => {
    sdkTelemetrySink.emit('sync.quicksync', {
      outcome: 'root-mismatch-fallback', fromBlock: 5, head: 9, tailCovered: false, reason: 'root-mismatch',
    })
    expect(trackMock).toHaveBeenCalledWith('sdk.quicksync', {
      outcome: 'root-mismatch-fallback',
      fromBlock: 5,
      head: 9,
      tailCovered: false,
      reason: 'root-mismatch',
    })
  })

  it('omits reason/status on the served path (they are fallback-only)', () => {
    sdkTelemetrySink.emit('sync.quicksync', { outcome: 'served', fromBlock: 5, head: 9, tailCovered: false })
    expect(trackMock).toHaveBeenCalledWith('sdk.quicksync', {
      outcome: 'served',
      fromBlock: 5,
      head: 9,
      tailCovered: false,
    })
  })

  it('ignores SDK events it does not map', () => {
    // WHY: the SDK may emit other operational events in future; the sink must not forward them as
    // sdk.quicksync (which would corrupt the typed telemetry stream).
    sdkTelemetrySink.emit('scan.progress', { fraction: 0.5 })
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('drops a malformed payload rather than emitting a garbage outcome', () => {
    // WHY: a producer/consumer skew must fail closed — a payload with an unrecognized outcome is
    // dropped, not forwarded with an invalid enum value.
    sdkTelemetrySink.emit('sync.quicksync', { outcome: 'bogus', fromBlock: 5, head: 9, tailCovered: false })
    expect(trackMock).not.toHaveBeenCalled()
  })
})
